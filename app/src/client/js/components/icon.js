/* Inline SVG icon helper — references /icons/sprite.svg (no icon font,
   no emoji). Use icon() to build markup, or [data-icon="name"] placeholders
   hydrated by hydrateIcons(). */

export function icon(name, { size = '', label } = {}) {
  const classes = ['icon', size ? `icon--${size}` : ''].filter(Boolean).join(' ');
  const a11y = label ? `role="img" aria-label="${escapeAttr(label)}"` : 'aria-hidden="true"';
  return `<svg class="${classes}" ${a11y}><use href="/icons/sprite.svg#i-${escapeAttr(name)}"></use></svg>`;
}

export function hydrateIcons(root = document) {
  for (const holder of root.querySelectorAll('[data-icon]')) {
    const name = holder.getAttribute('data-icon');
    const size = holder.getAttribute('data-icon-size') || '';
    holder.removeAttribute('data-icon');
    holder.removeAttribute('data-icon-size');
    holder.insertAdjacentHTML('beforeend', icon(name, { size }));
  }
}

function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
