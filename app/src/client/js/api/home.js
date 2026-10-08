import { api } from './client.js';

// Home API — rooms, cleaning, laundry, maintenance. See
// docs/home-management.md for the endpoint contract.

export function listRooms(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/home/rooms${suffix ? `?${suffix}` : ''}`);
}

export function getRoom(roomId) {
  return api.get(`/home/rooms/${encodeURIComponent(roomId)}`);
}

export function createRoom(payload) {
  return api.post('/home/rooms', payload);
}

export function updateRoom(roomId, payload) {
  return api.patch(`/home/rooms/${encodeURIComponent(roomId)}`, payload);
}

export function deleteRoom(roomId) {
  return api.del(`/home/rooms/${encodeURIComponent(roomId)}`);
}

export function listCleaning(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/home/cleaning${suffix ? `?${suffix}` : ''}`);
}

export function getCleaning(cleaningId) {
  return api.get(`/home/cleaning/${encodeURIComponent(cleaningId)}`);
}

export function createCleaning(payload) {
  return api.post('/home/cleaning', payload);
}

export function updateCleaning(cleaningId, payload) {
  return api.patch(`/home/cleaning/${encodeURIComponent(cleaningId)}`, payload);
}

export function deleteCleaning(cleaningId) {
  return api.del(`/home/cleaning/${encodeURIComponent(cleaningId)}`);
}

export function listLaundry(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/home/laundry${suffix ? `?${suffix}` : ''}`);
}

export function getLaundry(laundryId) {
  return api.get(`/home/laundry/${encodeURIComponent(laundryId)}`);
}

export function createLaundry(payload) {
  return api.post('/home/laundry', payload);
}

export function updateLaundry(laundryId, payload) {
  return api.patch(`/home/laundry/${encodeURIComponent(laundryId)}`, payload);
}

export function deleteLaundry(laundryId) {
  return api.del(`/home/laundry/${encodeURIComponent(laundryId)}`);
}

export function listMaintenance(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/home/maintenance${suffix ? `?${suffix}` : ''}`);
}

export function getMaintenance(maintenanceId) {
  return api.get(`/home/maintenance/${encodeURIComponent(maintenanceId)}`);
}

export function createMaintenance(payload) {
  return api.post('/home/maintenance', payload);
}

export function updateMaintenance(maintenanceId, payload) {
  return api.patch(`/home/maintenance/${encodeURIComponent(maintenanceId)}`, payload);
}

export function deleteMaintenance(maintenanceId) {
  return api.del(`/home/maintenance/${encodeURIComponent(maintenanceId)}`);
}

export function generateMaintenanceTask(maintenanceId) {
  return api.post(`/home/maintenance/${encodeURIComponent(maintenanceId)}/task`, {});
}