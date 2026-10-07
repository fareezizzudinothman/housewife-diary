// Household role helpers shared by the server (authorization checks) and the
// client (showing/hiding management UI). Keep this file framework-free and
// free of server-side imports.

export const HOUSEHOLD_ROLES = Object.freeze(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);

export const ROLE_RANK = Object.freeze({
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
});

export function hasAtLeast(role, minimum) {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[minimum] ?? -1);
}
