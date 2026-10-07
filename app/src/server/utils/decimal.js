// Prisma returns Decimal instances for DECIMAL columns; API responses use
// plain numbers (3-decimal quantities), so every view converts explicitly.
export function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}
