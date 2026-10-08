// Display helpers for money strings ("120.50"). All formatting happens here;
// pages never do monetary arithmetic in the browser.

const formatters = new Map();

export function formatMoney(amount, currency = 'SGD') {
  const value = Number(amount ?? 0);
  try {
    if (!formatters.has(currency)) {
      formatters.set(
        currency,
        new Intl.NumberFormat(undefined, { style: 'currency', currency }),
      );
    }
    return formatters.get(currency).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

// "+ 120.50" / "− 120.50" / "120.50" with the sign kept outside the currency
// symbol so list rows align cleanly.
export function formatSignedMoney(amount, currency, type) {
  const formatted = formatMoney(String(Math.abs(Number(amount))).length ? Math.abs(Number(amount)) : 0, currency);
  if (type === 'INCOME') {
    return `+ ${formatted}`;
  }
  if (type === 'EXPENSE') {
    return `− ${formatted}`;
  }
  return formatted;
}

export function amountClass(type) {
  if (type === 'INCOME') {
    return 'amount amount--income';
  }
  if (type === 'EXPENSE') {
    return 'amount amount--expense';
  }
  return 'amount amount--transfer';
}

// Number input helpers: values are sent as strings and validated server-side.
export function toAmountInput(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
