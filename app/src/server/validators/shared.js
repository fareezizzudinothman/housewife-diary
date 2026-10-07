import { AppError, ErrorCodes } from '../../shared/errors.js';

export function fieldError(field, message) {
  return { field, message };
}

export function throwValidationError(errors) {
  throw new AppError('Invalid request.', {
    code: ErrorCodes.VALIDATION_ERROR,
    status: 400,
    details: errors,
  });
}

// citext-style normalization: emails are stored and looked up lowercase.
export function normalizeEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim().toLowerCase();
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

export function trimString(value) {
  return typeof value === 'string' ? value.trim() : null;
}

export function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.length >= 1 && value.length <= maxLength;
}

// A small denylist of very common passwords, per docs/authentication.md
// ("minimum 10 characters, checked against a small common-password
// denylist; no artificial composition rules").
const COMMON_PASSWORDS = new Set([
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'qwertyuiop1',
  'qwerty12345',
  '1234567890',
  '12345678901',
  '0123456789',
  'abcdefghij',
  'abcdefghijk',
  'aaaaaaaaaa',
  'aaaaaaaaaaa',
  '1234123412',
  'iloveyou123',
  'sunshine123',
  'princess123',
  'football123',
  'baseball123',
  'letmein12345',
  'welcome1234',
  'admin123456',
  'master123456',
  'dragon123456',
  'monkey123456',
  'secret123456',
  'trustno12345',
  'password123',
  'p@ssword123',
  'housewife123',
  'housewife1',
]);

export const MIN_PASSWORD_LENGTH = 10;

export function checkPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (password.length > 200) {
    return 'Password must be at most 200 characters long.';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'This password is too common. Please choose a stronger one.';
  }
  return null;
}

const SUPPORTED_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

// Intl omits UTC even though it is the app's default timezone.
export function isValidTimezone(timezone) {
  return (
    typeof timezone === 'string' && (timezone === 'UTC' || SUPPORTED_TIMEZONES.has(timezone))
  );
}
