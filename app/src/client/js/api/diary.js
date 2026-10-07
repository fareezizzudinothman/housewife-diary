import { api, apiUpload } from './client.js';

// Diary API — entries are personal to the signed-in user inside the
// active household; see docs/diary.md for the endpoint contract.

export function listDiary(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/diary${suffix ? `?${suffix}` : ''}`);
}

export function getDiaryMeta() {
  return api.get('/diary/meta');
}

export function getDiaryEntry(entryId) {
  return api.get(`/diary/${encodeURIComponent(entryId)}`);
}

export function createDiaryEntry(payload) {
  return api.post('/diary', payload);
}

export function updateDiaryEntry(entryId, payload) {
  return api.patch(`/diary/${encodeURIComponent(entryId)}`, payload);
}

export function deleteDiaryEntry(entryId) {
  return api.del(`/diary/${encodeURIComponent(entryId)}`);
}

export function uploadAttachment(entryId, file) {
  return apiUpload(`/diary/${encodeURIComponent(entryId)}/attachments`, file);
}

export function deleteAttachment(entryId, attachmentId) {
  return api.del(
    `/diary/${encodeURIComponent(entryId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}

export function attachmentUrl(entryId, attachmentId) {
  return `/api/diary/${encodeURIComponent(entryId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
