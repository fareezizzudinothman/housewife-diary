import { icon } from './icon.js';

/* Shared page states — loading, empty and error blocks rendered as HTML
   strings so pages can drop them into any container. */

export function loadingState(label = 'Loading…') {
  return `
    <div class="state" role="status">
      <div class="spinner spinner--lg" aria-hidden="true"></div>
      <p>${label}</p>
    </div>`;
}

export function emptyState({ iconName = 'sparkles', title, text, action = '' } = {}) {
  return `
    <div class="state">
      ${icon(iconName)}
      <h3>${title}</h3>
      ${text ? `<p>${text}</p>` : ''}
      ${action}
    </div>`;
}

export function errorState(message = 'Something went wrong. Please try again.', retry = '') {
  return `
    <div class="state" role="alert">
      ${icon('alert-circle')}
      <h3>Couldn’t load this</h3>
      <p>${message}</p>
      ${retry}
    </div>`;
}
