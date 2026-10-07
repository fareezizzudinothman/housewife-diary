import {
  checkPasswordPolicy,
  fieldError,
  isNonEmptyString,
  isValidTimezone,
  normalizeEmail,
  throwValidationError,
  trimString,
} from './shared.js';

export function validateRegister(input) {
  const errors = [];
  const name = trimString(input?.name);
  if (!name || name.length > 80) {
    errors.push(fieldError('name', 'Name must be between 1 and 80 characters.'));
  }
  const email = normalizeEmail(input?.email);
  if (!email) {
    errors.push(fieldError('email', 'A valid email address is required.'));
  }
  const passwordProblem = checkPasswordPolicy(input?.password);
  if (passwordProblem) {
    errors.push(fieldError('password', passwordProblem));
  }
  const timezone =
    input?.timezone === undefined || input?.timezone === null || input?.timezone === ''
      ? 'UTC'
      : input?.timezone;
  if (!isValidTimezone(timezone)) {
    errors.push(fieldError('timezone', 'Unknown timezone.'));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return { name, email, password: input.password, timezone };
}

export function validateLogin(input) {
  const errors = [];
  const email = normalizeEmail(input?.email);
  if (!email) {
    errors.push(fieldError('email', 'A valid email address is required.'));
  }
  if (!isNonEmptyString(input?.password, 200)) {
    errors.push(fieldError('password', 'Password is required.'));
  }
  const rememberMe = input?.rememberMe === true || input?.rememberMe === 'true';
  if (errors.length) {
    throwValidationError(errors);
  }
  return { email, password: input.password, rememberMe };
}

export function validateForgotPassword(input) {
  const email = normalizeEmail(input?.email);
  if (!email) {
    throwValidationError([fieldError('email', 'A valid email address is required.')]);
  }
  return { email };
}

export function validateResetPassword(input) {
  const errors = [];
  const token = trimString(input?.token);
  if (!token || token.length > 200) {
    errors.push(fieldError('token', 'A reset token is required.'));
  }
  const passwordProblem = checkPasswordPolicy(input?.password);
  if (passwordProblem) {
    errors.push(fieldError('password', passwordProblem));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return { token, password: input.password };
}

export function validateChangePassword(input) {
  const errors = [];
  if (!isNonEmptyString(input?.currentPassword, 200)) {
    errors.push(fieldError('currentPassword', 'Your current password is required.'));
  }
  const passwordProblem = checkPasswordPolicy(input?.newPassword);
  if (passwordProblem) {
    errors.push(fieldError('newPassword', passwordProblem));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return { currentPassword: input.currentPassword, newPassword: input.newPassword };
}

export function validateVerifyEmailQuery(query) {
  const token = trimString(query?.token);
  if (!token || token.length > 200) {
    throwValidationError([fieldError('token', 'A verification token is required.')]);
  }
  return { token };
}
