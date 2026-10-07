import bcrypt from 'bcryptjs';
import { config } from '../config/config.js';

// bcrypt cost 12 per docs/authentication.md. The cost is configurable via
// BCRYPT_COST so the test suite can run fast; production enforces a minimum
// of 10 (see config.js).
export async function hashPassword(password, cost = config.bcryptCost) {
  return bcrypt.hash(password, cost);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

// Precomputed hash used to equalize timing when the login email is unknown,
// so "unknown email" and "wrong password" are indistinguishable.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'timing-equalization-dummy-password',
  config.bcryptCost,
);

export function dummyPasswordHash() {
  return DUMMY_PASSWORD_HASH;
}
