import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, ErrorCodes } from '../../shared/errors.js';
import { fieldError, throwValidationError } from '../validators/shared.js';
import * as documentsRepository from '../repositories/documentsRepository.js';
import * as financeRepository from '../repositories/financeRepository.js';
import * as homeRepository from '../repositories/homeRepository.js';
import * as inventoryRepository from '../repositories/inventoryRepository.js';
import * as familyRepository from '../repositories/familyRepository.js';

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 86_400_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../../uploads/documents');

// Type is decided by the file bytes, never by the client's header.
const FILE_SIGNATURES = [
  {
    mime: 'image/jpeg',
    ext: '.jpg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
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
    mime: 'image/webp',
    ext: '.webp',
    test: (b) =>
      b.length > 12 &&
      b.toString('latin1', 0, 4) === 'RIFF' &&
      b.toString('latin1', 8, 12) === 'WEBP',
  },
  {
    mime: 'application/pdf',
    ext: '.pdf',
    test: (b) => b.length > 5 && b.toString('latin1', 0, 5) === '%PDF-',
  },
];

const STORED_NAME_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/;

function notFound(message = 'Document not found.') {
  return new AppError(message, { code: ErrorCodes.NOT_FOUND, status: 404 });
}

function detectFile(buffer) {
  for (const signature of FILE_SIGNATURES) {
    if (signature.test(buffer)) {
      return signature;
    }
  }
  return null;
}

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
    return 'document';
  }
  return cleaned.slice(0, 120);
}

async function unlinkQuietly(storedName) {
  try {
    await fs.unlink(path.join(uploadsDir, storedName));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[documents] failed to remove file ${storedName}: ${error.message}`);
    }
  }
}

function todayAtStart(user, now = new Date()) {
  return new Date(`${dateStringInUserTimezone(user, now)}T00:00:00.000Z`);
}

function dateStringInUserTimezone(user, now) {
  const tz = user?.timezone ?? 'UTC';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function expiryStatusOf(document, user) {
  if (!document.expiryDate) {
    return null;
  }
  const today = todayAtStart(user);
  const expiry = new Date(document.expiryDate).getTime();
  const horizon = today.getTime() + EXPIRING_SOON_DAYS * DAY_MS;
  if (expiry < today.getTime()) {
    return 'EXPIRED';
  }
  if (expiry <= horizon) {
    return 'EXPIRING_SOON';
  }
  return 'ACTIVE';
}

export function toDocumentView(document, user) {
  return {
    id: document.id,
    title: document.title,
    description: document.description ?? null,
    category: document.category,
    originalName: document.originalName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    expiryDate: document.expiryDate ? document.expiryDate.toISOString().slice(0, 10) : null,
    expiryStatus: expiryStatusOf(document, user),
    referenceType: document.referenceType ?? null,
    referenceId: document.referenceId ?? null,
    uploadedBy: document.uploadedBy ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

async function assertReference(referenceType, referenceId, householdId) {
  if (!referenceType) {
    return { referenceType: null, referenceId: null };
  }
  const checks = {
    MAINTENANCE: () => homeRepository.findMaintenanceById(referenceId, householdId),
    FINANCE_TRANSACTION: () => financeRepository.findTransactionById(referenceId, householdId),
    INVENTORY: () => inventoryRepository.findInventoryItemById(referenceId, householdId),
    FAMILY_MEMBER: () => familyRepository.findMemberById(referenceId, householdId),
  };
  const target = await checks[referenceType]();
  if (!target) {
    throwValidationError([fieldError('referenceId', 'The linked record was not found.')]);
  }
  return { referenceType, referenceId };
}

export async function listDocuments({ user, householdId, query }) {
  const [rows, total] = await Promise.all([
    documentsRepository.listDocuments(householdId, query),
    documentsRepository.countDocuments(householdId, query),
  ]);
  let items = rows.map((document) => toDocumentView(document, user));
  if (query.status) {
    items = items.filter((document) => document.expiryStatus === query.status);
    return { items, ...paginate(items.length, query.page, query.limit) };
  }
  return { items, ...paginate(total, query.page, query.limit) };
}

function paginate(total, page, limit) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getDocument({ user, householdId, id }) {
  const document = await documentsRepository.findDocumentById(id, householdId);
  if (!document) {
    throw notFound();
  }
  return toDocumentView(document, user);
}

export async function createDocument({ user, householdId, data, buffer, originalName }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError('Attach a document file.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
      details: [fieldError('file', 'Attach a document file.')],
    });
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new AppError('Documents must be 5MB or smaller.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 413,
      details: [fieldError('file', 'Documents must be 5MB or smaller.')],
    });
  }
  const signature = detectFile(buffer);
  if (!signature) {
    throw new AppError('Only JPEG, PNG, WebP and PDF documents are allowed.', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
      details: [fieldError('file', 'Only JPEG, PNG, WebP and PDF documents are allowed.')],
    });
  }
  const { referenceType, referenceId } = await assertReference(
    data.referenceType,
    data.referenceId,
    householdId,
  );

  const storedName = `${randomBytes(16).toString('hex')}${signature.ext}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, storedName), buffer, { flag: 'wx' });

  try {
    const document = await documentsRepository.createDocument({
      householdId,
      uploadedById: user.id,
      title: data.title,
      description: data.description,
      category: data.category,
      originalName: sanitizeOriginalName(originalName),
      storedName,
      mimeType: signature.mime,
      sizeBytes: buffer.length,
      expiryDate: data.expiryDate,
      referenceType,
      referenceId,
    });
    return toDocumentView(document, user);
  } catch (error) {
    await unlinkQuietly(storedName);
    throw error;
  }
}

export async function updateDocument({ user, householdId, id, patch }) {
  const current = await documentsRepository.findDocumentById(id, householdId);
  if (!current) {
    throw notFound();
  }
  const data = { ...patch };
  if (patch.referenceType !== undefined || patch.referenceId !== undefined) {
    const { referenceType, referenceId } = await assertReference(
      patch.referenceType,
      patch.referenceId,
      householdId,
    );
    data.referenceType = referenceType;
    data.referenceId = referenceId;
  }
  if (Object.keys(data).length === 0) {
    throwValidationError([fieldError('_', 'Provide at least one field to update.')]);
  }
  const updated = await documentsRepository.updateDocument(id, householdId, data);
  return toDocumentView(updated, user);
}

export async function getDocumentFile({ householdId, id }) {
  const document = await documentsRepository.findDocumentById(id, householdId);
  if (!document || !STORED_NAME_PATTERN.test(document.storedName)) {
    throw notFound();
  }
  const filePath = path.join(uploadsDir, document.storedName);
  try {
    await fs.access(filePath);
  } catch {
    throw notFound();
  }
  return {
    filePath,
    mimeType: document.mimeType,
    originalName: document.originalName,
    sizeBytes: document.sizeBytes,
  };
}

export async function deleteDocument({ householdId, id }) {
  const document = await documentsRepository.findDocumentById(id, householdId);
  if (!document) {
    throw notFound();
  }
  const result = await documentsRepository.deleteDocument(id, householdId);
  if (result.count === 0) {
    throw notFound();
  }
  await unlinkQuietly(document.storedName);
  return { id, deleted: true };
}