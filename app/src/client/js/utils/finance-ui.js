// Shared finance page building blocks (money tiles, rows, chips, selects).

export function buildMoneyTile(label, value, metaText, valueClass = '') {
  const tile = document.createElement('div');
  tile.className = 'money-tile';
  const labelEl = document.createElement('span');
  labelEl.className = 'money-tile__label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = `money-tile__value ${valueClass}`.trim();
  valueEl.textContent = value;
  const metaEl = document.createElement('span');
  metaEl.className = 'money-tile__meta';
  metaEl.textContent = metaText ?? '';
  tile.append(labelEl, valueEl);
  if (metaText) {
    tile.append(metaEl);
  }
  return tile;
}

export function buildChip(text, variant = 'muted') {
  const span = document.createElement('span');
  span.className = `finance-chip finance-chip--${variant}`;
  span.textContent = text;
  return span;
}

export function buildField(label, input) {
  const field = document.createElement('div');
  field.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  if (input.id) {
    labelEl.htmlFor = input.id;
  }
  field.append(labelEl, input);
  return field;
}

export function buildSelect(options, { value = '', includeEmpty = null, id = '' } = {}) {
  const select = document.createElement('select');
  if (id) {
    select.id = id;
  }
  if (includeEmpty !== null) {
    select.append(new Option(includeEmpty, ''));
  }
  for (const option of options) {
    select.append(new Option(option.label, option.value));
  }
  select.value = value;
  return select;
}

export function buildInput({ type = 'text', value = '', ...attrs } = {}) {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  for (const [key, attrValue] of Object.entries(attrs)) {
    input.setAttribute(key, attrValue);
  }
  return input;
}

// Compact row: title link, meta line, right-aligned amount, action icons.
export function buildRow({ title, href, metaParts = [], amount = null, amountClass = '', actions = [] }) {
  const row = document.createElement('div');
  row.className = 'item-row finance-row';

  const info = document.createElement('div');
  info.className = 'item-info';
  info.style.flex = '1';
  const titleEl = href ? document.createElement('a') : document.createElement('span');
  if (href) {
    titleEl.href = href;
    titleEl.className = 'recipe-row__title';
  }
  titleEl.textContent = title;
  const metaEl = document.createElement('div');
  metaEl.className = 'recipe-row__meta';
  for (const part of metaParts.filter(Boolean)) {
    const span = document.createElement('span');
    span.className = 'meta-text';
    span.textContent = part;
    metaEl.append(span);
  }
  info.append(titleEl, metaEl);

  if (amount !== null) {
    const amountEl = document.createElement('span');
    amountEl.className = `${amountClass} finance-row__amount`.trim();
    amountEl.textContent = amount;
    row.append(info, amountEl);
  } else {
    row.append(info);
  }

  if (actions.length) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'item-actions';
    for (const action of actions) {
      actionsEl.append(action);
    }
    row.append(actionsEl);
  }
  return row;
}
