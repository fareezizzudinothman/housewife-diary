import { icon } from './icon.js';

/* Toast notifications — transient feedback for actions (saves, resets).
   The region is polite live-region for screen readers. */

const ICONS = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

function region() {
  let element = document.querySelector('.toast-region');
  if (!element) {
    element = document.createElement('div');
    element.className = 'toast-region';
    element.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-atomic', 'false');
    document.body.appendChild(element);
  }
  return element;
}

export function toast(message, { type = 'info', duration = 3600 } = {}) {
  const element = document.createElement('div');
  element.className = `toast toast--${type}`;
  element.setAttribute('role', type === 'error' ? 'alert' : 'status');
  element.innerHTML = `${icon(ICONS[type] ?? 'info')}<span></span>`;
  element.querySelector('span').textContent = message;
  region().appendChild(element);

  const remove = () => element.remove();
  if (duration > 0) {
    setTimeout(remove, duration);
  }
  element.addEventListener('click', remove);
  return { dismiss: remove };
}
