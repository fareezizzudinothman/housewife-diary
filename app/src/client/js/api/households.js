import { api } from './client.js';

export function createHousehold(name) {
  return api.post('/households', { name });
}

export function listHouseholds() {
  return api.get('/households');
}

export function getHousehold(householdId) {
  return api.get(`/households/${encodeURIComponent(householdId)}`);
}

export function switchHousehold(householdId) {
  return api.post(`/households/${encodeURIComponent(householdId)}/switch`);
}

export function listMembers(householdId) {
  return api.get(`/households/${encodeURIComponent(householdId)}/members`);
}

export function addMember(householdId, email, role = 'MEMBER') {
  return api.post(`/households/${encodeURIComponent(householdId)}/members`, { email, role });
}

export function updateMemberRole(householdId, userId, role) {
  return api.patch(`/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(userId)}`, { role });
}

export function removeMember(householdId, userId) {
  return api.del(`/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(userId)}`);
}

export function leaveHousehold(householdId) {
  return api.post(`/households/${encodeURIComponent(householdId)}/leave`);
}
