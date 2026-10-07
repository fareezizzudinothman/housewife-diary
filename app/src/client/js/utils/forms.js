export function readFormData(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    data[key] = typeof value === 'string' ? value.trim() : value;
  }
  return data;
}

export function setStatus(element, message, kind = 'muted') {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.className = `form-status form-status--${kind}`;
}

export function setBusy(form, busy) {
  const submitButton = form.querySelector('[type="submit"]');
  if (submitButton) {
    submitButton.disabled = busy;
  }
}

export function describeError(error) {
  if (error?.details?.length) {
    return `${error.message} ${error.details.map((detail) => detail.message).join(' ')}`.trim();
  }
  return error?.message ?? 'Something went wrong. Please try again.';
}
