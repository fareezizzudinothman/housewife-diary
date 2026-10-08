import fs from 'node:fs';
import { sendSuccess } from '../utils/http.js';
import * as diaryService from '../services/diaryService.js';

export async function listEntries(req, res, next) {
  try {
    const result = await diaryService.listEntries({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function listMeta(req, res, next) {
  try {
    const meta = await diaryService.listMeta({
      user: req.user,
      householdId: req.householdId,
    });
    return sendSuccess(res, meta);
  } catch (error) {
    return next(error);
  }
}

export async function getEntry(req, res, next) {
  try {
    const entry = await diaryService.getEntry({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, { entry });
  } catch (error) {
    return next(error);
  }
}

export async function createEntry(req, res, next) {
  try {
    const entry = await diaryService.createEntry({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
    });
    return sendSuccess(res, { entry }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateEntry(req, res, next) {
  try {
    const entry = await diaryService.updateEntry({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { entry });
  } catch (error) {
    return next(error);
  }
}

export async function deleteEntry(req, res, next) {
  try {
    const result = await diaryService.deleteEntry({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function uploadAttachment(req, res, next) {
  try {
    // The client percent-encodes the display name in the header.
    let filename = req.headers['x-filename'];
    if (typeof filename === 'string') {
      try {
        filename = decodeURIComponent(filename);
      } catch {
        // Malformed encoding: keep the raw value, sanitization still applies.
      }
    }
    const attachment = await diaryService.addAttachment({
      user: req.user,
      householdId: req.householdId,
      entryId: req.params.id,
      buffer: req.body,
      originalName: filename,
    });
    return sendSuccess(res, { attachment }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function serveAttachment(req, res, next) {
  try {
    const file = await diaryService.getAttachment({
      user: req.user,
      householdId: req.householdId,
      entryId: req.params.id,
      attachmentId: req.params.attachmentId,
    });
    const wantsDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `${wantsDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    const stream = fs.createReadStream(file.filePath);
    stream.on('error', (error) => next(error));
    return stream.pipe(res);
  } catch (error) {
    return next(error);
  }
}

export async function deleteAttachment(req, res, next) {
  try {
    const result = await diaryService.deleteAttachment({
      user: req.user,
      householdId: req.householdId,
      entryId: req.params.id,
      attachmentId: req.params.attachmentId,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}
