import { HOUSEHOLD_ROLES } from '../../shared/roles.js';
import { fieldError, normalizeEmail, throwValidationError, trimString } from './shared.js';

const ASSIGNABLE_ROLES_ON_INVITE = ['ADMIN', 'MEMBER', 'VIEWER'];

export function validateCreateHousehold(input) {
  const name = trimString(input?.name);
  if (!name || name.length > 80) {
    throwValidationError([fieldError('name', 'Household name must be between 1 and 80 characters.')]);
  }
  return { name };
}

export function validateAddMember(input) {
  const errors = [];
  const email = normalizeEmail(input?.email);
  if (!email) {
    errors.push(fieldError('email', 'A valid email address of an existing user is required.'));
  }
  const role = input?.role === undefined || input?.role === null || input?.role === ''
    ? 'MEMBER'
    : input.role;
  if (role === 'OWNER') {
    errors.push(
      fieldError('role', 'Ownership is transferred by the owner, not assigned on invite.'),
    );
  } else if (!ASSIGNABLE_ROLES_ON_INVITE.includes(role)) {
    errors.push(fieldError('role', `Role must be one of: ${HOUSEHOLD_ROLES.join(', ')}.`));
  }
  if (errors.length) {
    throwValidationError(errors);
  }
  return { email, role };
}

export function validateUpdateMemberRole(input) {
  const role = input?.role;
  if (!HOUSEHOLD_ROLES.includes(role)) {
    throwValidationError([fieldError('role', `Role must be one of: ${HOUSEHOLD_ROLES.join(', ')}.`)]);
  }
  return { role };
}
