import { AppError, ErrorCodes } from '../../shared/errors.js';
import * as notesRepository from '../repositories/notesRepository.js';

function notFound() {
  return new AppError('Note not found.', { code: ErrorCodes.NOT_FOUND, status: 404 });
}

function toNoteView(note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    excerpt: note.content.length > 240 ? `${note.content.slice(0, 237)}…` : note.content,
    category: note.category ?? null,
    pinned: note.pinned,
    archived: note.archived,
    tags: note.tags.map((link) => ({ id: link.tag.id, name: link.tag.name })),
    createdBy: { id: note.createdBy.id, name: note.createdBy.name },
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function paginate(total, page, limit) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function resolveTagIds({ householdId, names }) {
  const tagIds = [];
  for (const name of names) {
    const tag = await notesRepository.resolveNoteTag({
      householdId,
      name,
      normalized: name.toLowerCase(),
    });
    tagIds.push(tag.id);
  }
  return tagIds;
}

export async function listNotes({ householdId, query }) {
  const [rows, total] = await Promise.all([
    notesRepository.listNotes(householdId, query),
    notesRepository.countNotes(householdId, query),
  ]);
  return { items: rows.map(toNoteView), ...paginate(total, query.page, query.limit) };
}

export async function getNote({ householdId, id }) {
  const note = await notesRepository.findNoteById(id, householdId);
  if (!note) {
    throw notFound();
  }
  return toNoteView(note);
}

export async function createNote({ user, householdId, data }) {
  const tagIds = await resolveTagIds({ householdId, names: data.tags });
  const note = await notesRepository.createNote(
    { householdId, createdById: user.id },
    {
      title: data.title,
      content: data.content,
      category: data.category,
      pinned: data.pinned,
      archived: data.archived,
      tags: tagIds,
    },
  );
  return toNoteView(note);
}

export async function updateNote({ householdId, id, patch }) {
  const existing = await notesRepository.findNoteById(id, householdId);
  if (!existing) {
    throw notFound();
  }
  const data = { ...patch };
  if (patch.tags !== undefined) {
    data.tags = await resolveTagIds({ householdId, names: patch.tags });
  }
  const note = await notesRepository.updateNote(id, householdId, data);
  return toNoteView(note);
}

export async function deleteNote({ householdId, id }) {
  const result = await notesRepository.deleteNote(id, householdId);
  if (result.count === 0) {
    throw notFound();
  }
  return { id, deleted: true };
}

export async function listNoteTags({ householdId }) {
  const tags = await notesRepository.listNoteTags(householdId);
  return {
    items: tags
      .filter((tag) => tag._count.notes > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tag) => ({ id: tag.id, name: tag.name, count: tag._count.notes })),
  };
}