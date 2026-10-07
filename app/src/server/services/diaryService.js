import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import * as diaryRepository from '../repositories/diaryRepository.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ENTRY = 5;
const MAX_EXCERPT_LENGTH = 160;

// Physical files live under app/uploads/diary/ (gitignored); the database
// only ever stores metadata plus a server-generated stored name.
const uploadsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../uploads/diary',
);

// Only these image types are accepted, and only when the magic bytes match.
const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/gif',
    ext: '.gif',
    test: (b) =>
      b.length > 6 &&
      b.toString('latin1', 0, 3) === 'GIF' &&
      (b.toString('latin1', 3, 6) === '87a' || b.toString('latin1', 3, 6) === '89a'),
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) =>
      b.length > 12 &&
      b.toString('latin1', 0, 4) === 'RIFF' &&
      b.toString('latin1', 8, 12) === 'WEBP',
  },
];

// Generated names are validated again before any path is built (defense in
// depth: a stored name never leaves [a-f0-9]{32} + known extension).
const STORED_NAME_PATTERN = /^[a-f0-9]{32}\.(jpg|png|gif|webp)$/;

function notFound() {
  return new AppError('Diary entry not found.', {
    code: ErrorCodes.NOT_FOUND,
    status: 404,
  });
}

function formatEntryDate(date) {
  return date.toISOString().slice(0, 10);
}

function toExcerpt(content) {
  const singleLine = content.replace(/\s+/g, ' ').trim();
  return singleLine.length > MAX_EXCERPT_LENGTH
    ? `${singleLine.slice(0, MAX_EXCERPT_LENGTH)}…`
    : singleLine;
}

function toTagViews(entry) {
  return entry.tags.map((link) => ({ id: link.tag.id, name: link.tag.name }));
}

function toMoodView(entry) {
  return entry.mood ? { id: entry.mood.id, name: entry.mood.name } : null;
}

function toListView(entry) {
  return {
    id: entry.id,
    title: entry.title,
    excerpt: toExcerpt(entry.content),
    entryDate: formatEntryDate(entry.entryDate),
    timeOfDay: entry.timeOfDay,
    mood: toMoodView(entry),
    tags: toTagViews(entry),
    attachmentCount: entry._count.attachments,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function toDetailView(entry, attachments) {
  return {
    ...toListView(entry),
    content: entry.content,
    attachments,
  };
}

// The list endpoint returns attachments as a count only; the detail endpoint
// needs full metadata including a usable URL.
async function loadAttachmentViews(entryId) {
  const attachments = await diaryRepository.listAttachments(entryId);
  return attachments.map((attachment) => ({
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: `/api/diary/${entryId}/attachments/${attachment.id}`,
  }));
}

async function resolveTagIds({ householdId, userId, names }) {
  const tagIds = [];
  for (const name of names) {
    const tag = await diaryRepository.resolveTag({
      householdId,
      userId,
      name,
      normalized: name.toLowerCase(),
    });
    tagIds.push(tag.id);
  }
  return tagIds;
}

async function assertMoodExists(moodId) {
  if (moodId === null || moodId === undefined) {
    return null;
  }
  const mood = await diaryRepository.findMoodById(moodId);
  if (!mood) {
    throwValidationError([fieldError('mood', 'Choose a mood from the list.')]);
  }
  return mood.id;
}

function detectImage(buffer) {
  for (const signature of IMAGE_SIGNATURES) {
    if (signature.test(buffer)) {
      return signature;
    }
  }
  return null;
}

// Display-only name: strip any path segments, control characters and cap
// the length. The physical file never uses this value.
function sanitizeOriginalName(rawName) {
  const base = typeof rawName === 'string' ? rawName.split(/[\\/]/).pop() : '';
  let cleaned = '';
  for (const ch of base) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code !== 127 && code < 160) {
      cleaned += ch;
    }
  }
  cleaned = cleaned.trim().replace(/^\.+/, '');
  if (!cleaned) {
    return 'image';
  }
  return cleaned.slice(0, 120);
}

async function unlinkQuietly(storedName) {
  try {
    await fs.unlink(path.join(uploadsDir, storedName));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[diary] failed to remove attachment file ${storedName}: ${error.message}`);
    }
  }
}

export async function listEntries({ user, householdId, query }) {
  // A mood filter that matches nothing in the catalog is a client mistake,
  // not an empty result.
  if (query.mood) {
    await assertMoodExists(query.mood);
  }
  const scope = { householdId, userId: user.id };
  const [total, entries] = await Promise.all([
    diaryRepository.countEntries(scope, query),
    diaryRepository.listEntries(scope, query),
  ]);
  const limit = query.limit;
  return {
    items: entries.map(toListView),
    page: query.page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getEntry({ user, householdId, id }) {
  const entry = await diaryRepository.findEntryById(id, {
    householdId,
    userId: user.id,
  });
  if (!entry) {
    throw notFound();
  }
  const attachments = await loadAttachmentViews(entry.id);
  return toDetailView(entry, attachments);
}

export async function createEntry({ user, householdId, data }) {
  const moodId = await assertMoodExists(data.mood);
  const tagIds = await resolveTagIds({
    householdId,
    userId: user.id,
    names: data.tags,
  });
  const entry = await diaryRepository.createEntry(
    { householdId, userId: user.id },
    {
      title: data.title,
      content: data.content,
      entryDate: data.entryDate,
      timeOfDay: data.timeOfDay ?? 'EVENING',
      moodId,
      tags: tagIds,
    },
  );
  const attachments = await loadAttachmentViews(entry.id);
  return toDetailView(entry, attachments);
}

export async function updateEntry({ user, householdId, id, patch }) {
  const existing = await diaryRepository.findEntryById(id, {
    householdId,
    userId: user.id,
  });
  if (!existing) {
    throw notFound();
  }

  const moodId =
    patch.mood !== undefined ? await assertMoodExists(patch.mood) : undefined;
  const tagIds =
    patch.tags !== undefined
      ? await resolveTagIds({ householdId, userId: user.id, names: patch.tags })
      : undefined;

  const entry = await diaryRepository.updateEntry(
    id,
    { householdId, userId: user.id },
    {
      title: patch.title,
      content: patch.content,
      entryDate: patch.entryDate,
      timeOfDay: patch.timeOfDay,
      moodId,
      tags: tagIds,
    },
  );
  if (!entry) {
    throw notFound();
  }
  const attachments = await loadAttachmentViews(entry.id);
  return toDetailView(entry, attachments);
}

export async function deleteEntry({ user, householdId, id }) {
  const entry = await diaryRepository.findEntryById(id, {
    householdId,
    userId: user.id,
  });
  if (!entry) {
    throw notFound();
  }
  const attachments = await diaryRepository.listAttachments(entry.id);
  await diaryRepository.deleteEntry(entry.id, { householdId, userId: user.id });
  // Best-effort file cleanup after the database rows are gone (rows cascade).
  await Promise.all(attachments.map((attachment) => unlinkQuietly(attachment.storedName)));
  return { id: entry.id, deleted: true };
}

export async function listMeta({ user, householdId }) {
  const [moods, tags] = await Promise.all([
    diaryRepository.listMoods(),
    diaryRepository.listUserTags({ householdId, userId: user.id }),
  ]);
  return {
    moods: moods.map((mood) => ({
      id: mood.id,
      name: mood.name,
      sortOrder: mood.sortOrder,
    })),
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
  };
}

export async function addAttachment({ user, householdId, entryId, buffer, originalName }) {
  const entry = await diaryRepository.findEntryById(entryId, {
    householdId,
    userId: user.id,
  });
  if (!entry) {
    throw notFound();
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError('Attach a valid image file.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
      details: [fieldError('file', 'Attach a valid image file.')],
    });
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new AppError('Attachments must be 5MB or smaller.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 413,
      details: [fieldError('file', 'Attachments must be 5MB or smaller.')],
    });
  }

  // Type is decided by the file bytes, never by the client's header.
  const signature = detectImage(buffer);
  if (!signature) {
    throw new AppError('Only JPEG, PNG, GIF and WebP images are allowed.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
      details: [fieldError('file', 'Only JPEG, PNG, GIF and WebP images are allowed.')],
    });
  }

  const currentCount = await diaryRepository.countAttachments(entryId);
  if (currentCount >= MAX_ATTACHMENTS_PER_ENTRY) {
    throw new AppError(`Entries can have at most ${MAX_ATTACHMENTS_PER_ENTRY} attachments.`, {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
      details: [
        fieldError('file', `Entries can have at most ${MAX_ATTACHMENTS_PER_ENTRY} attachments.`),
      ],
    });
  }

  const storedName = `${randomBytes(16).toString('hex')}${signature.ext}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, storedName), buffer, { flag: 'wx' });

  try {
    const attachment = await diaryRepository.createAttachment(entryId, {
      originalName: sanitizeOriginalName(originalName),
      storedName,
      mimeType: signature.mime,
      sizeBytes: buffer.length,
    });
    return { ...attachment, entryId };
  } catch (error) {
    await unlinkQuietly(storedName);
    throw error;
  }
}

// Returns file details for the controller to stream; never exposes the
// physical path outside this module.
export async function getAttachment({ user, householdId, entryId, attachmentId }) {
  const entry = await diaryRepository.findEntryById(entryId, {
    householdId,
    userId: user.id,
  });
  if (!entry) {
    throw notFound();
  }
  const attachment = await diaryRepository.findAttachment(attachmentId, entryId);
  if (!attachment || !STORED_NAME_PATTERN.test(attachment.storedName)) {
    throw notFound();
  }
  const filePath = path.join(uploadsDir, attachment.storedName);
  try {
    await fs.access(filePath);
  } catch {
    throw notFound();
  }
  return {
    filePath,
    mimeType: attachment.mimeType,
    originalName: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
  };
}

export async function deleteAttachment({ user, householdId, entryId, attachmentId }) {
  const entry = await diaryRepository.findEntryById(entryId, {
    householdId,
    userId: user.id,
  });
  if (!entry) {
    throw notFound();
  }
  const attachment = await diaryRepository.findAttachment(attachmentId, entryId);
  if (!attachment) {
    throw notFound();
  }
  await diaryRepository.deleteAttachment(attachmentId, entryId);
  await unlinkQuietly(attachment.storedName);
  return { id: attachmentId, deleted: true };
}
