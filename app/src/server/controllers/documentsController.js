import { sendSuccess } from '../utils/http.js';
import * as documentsService from '../services/documentsService.js';

export async function listDocuments(req, res, next) {
  try {
    const result = await documentsService.listDocuments({
      user: req.user,
      householdId: req.householdId,
      query: req.validated,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getDocument(req, res, next) {
  try {
    const document = await documentsService.getDocument({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, document);
  } catch (error) {
    return next(error);
  }
}

export async function createDocument(req, res, next) {
  try {
    let filename = req.headers['x-filename'];
    if (typeof filename === 'string') {
      try {
        filename = decodeURIComponent(filename);
      } catch {
        // Malformed encoding: keep the raw value, sanitization still applies.
      }
    }
    const document = await documentsService.createDocument({
      user: req.user,
      householdId: req.householdId,
      data: req.validated,
      buffer: req.body,
      originalName: filename,
    });
    return sendSuccess(res, { document }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function updateDocument(req, res, next) {
  try {
    const document = await documentsService.updateDocument({
      user: req.user,
      householdId: req.householdId,
      id: req.params.id,
      patch: req.validated,
    });
    return sendSuccess(res, { document });
  } catch (error) {
    return next(error);
  }
}

export async function serveDocumentFile(req, res, next) {
  try {
    const file = await documentsService.getDocumentFile({
      householdId: req.householdId,
      id: req.params.id,
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
    return res.sendFile(file.filePath);
  } catch (error) {
    return next(error);
  }
}

export async function deleteDocument(req, res, next) {
  try {
    const result = await documentsService.deleteDocument({
      householdId: req.householdId,
      id: req.params.id,
    });
    return sendSuccess(res, result);
  } catch (error) {
    return next(error);
  }
}