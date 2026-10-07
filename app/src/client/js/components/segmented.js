/* Segmented control / tabs — declarative wiring for .segmented groups.
   Markup:
     <div class="segmented" data-segmented role="group">
       <button class="segmented__option" data-value="LIGHT" aria-pressed="false">…</button>
     </div>
   Calls onChange(value) when the selection changes. */

export function initSegmented(container, onChange) {
  const options = [...container.querySelectorAll('.segmented__option')];

  const select = (value, { silent = false } = {}) => {
    for (const option of options) {
      option.setAttribute('aria-pressed', String(option.dataset.value === value));
    }
    if (!silent && onChange) {
      onChange(value);
    }
  };

  for (const option of options) {
    option.addEventListener('click', () => select(option.dataset.value));
  }

  const pressed = options.find((o) => o.getAttribute('aria-pressed') === 'true');
  if (pressed) {
    select(pressed.dataset.value, { silent: true });
  }

  return { select };
}
