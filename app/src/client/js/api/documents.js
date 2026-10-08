import { api, apiUpload } from './client.js';

// Documents API — secure file upload, private serving, expiry, references. See
// docs/documents.md for the endpoint contract.

export function listDocuments(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/documents${suffix ? `?${suffix}` : ''}`);
}

export function getDocument(documentId) {
  return api.get(`/documents/${encodeURIComponent(documentId)}`);
}

export function createDocument(file, meta = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return apiUpload(`/documents${suffix ? `?${suffix}` : ''}`, file);
}

export function updateDocument(documentId, payload) {
  return api.patch(`/documents/${encodeURIComponent(documentId)}`, payload);
}

export function deleteDocument(documentId) {
  return api.del(`/documents/${encodeURIComponent(documentId)}`);
}

export function getDocumentFileUrl(documentId) {
  return `/api/documents/${encodeURIComponent(documentId)}/file`;
}