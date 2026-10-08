import { Prisma } from '@prisma/client';

// Money is stored as Decimal(14,2) and serialized to API clients as
// 2-decimal strings ("120.50") — never JS floats. Arithmetic that must be
// exact uses Decimal.js through this module only (see docs/finance.md).

export const Decimal = Prisma.Decimal;

export const ZERO = new Decimal(0);

// 12 integer digits + 2 decimals, matching Decimal(14,2).
export const MAX_MONEY = new Decimal('999999999999.99');
export const MIN_MONEY = MAX_MONEY.negated();

export function toDecimal(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return value instanceof Decimal ? value : new Decimal(value);
}

// Canonical API representation of a stored amount.
export function toAmount(value) {
  const decimal = toDecimal(value);
  return decimal === null ? null : decimal.toFixed(2);
}

export function addAmounts(values) {
  let total = new Decimal(0);
  for (const value of values) {
    const decimal = toDecimal(value);
    if (decimal !== null) {
      total = total.plus(decimal);
    }
  }
  return total;
}

// Rounded percentage for display (numbers are fine here — this is a derived
// ratio, not money). Returns null when the base is zero.
export function percentOf(part, whole) {
  const base = toDecimal(whole);
  if (base === null || base.isZero()) {
    return null;
  }
  return Number(toDecimal(part).div(base).mul(100).toFixed(1));
}
