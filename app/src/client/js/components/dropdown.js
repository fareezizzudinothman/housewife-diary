/* Dropdown menu — click toggles, outside click and Escape close.
   Markup: <div class="dropdown" data-dropdown> with [data-dropdown-trigger]
   and [data-dropdown-menu] inside. */

export function initDropdown(root = document) {
  for (const dropdown of root.querySelectorAll('[data-dropdown]')) {
    if (dropdown.dataset.dropdownReady === 'true') {
      continue;
    }
    dropdown.dataset.dropdownReady = 'true';

    const trigger = dropdown.querySelector('[data-dropdown-trigger]');
    if (!trigger) {
      continue;
    }

    const setOpen = (open) => {
      dropdown.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', String(open));
    };

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!dropdown.classList.contains('is-open'));
    });

    dropdown.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.focus();
      }
    });

    document.addEventListener('click', (event) => {
      if (!dropdown.contains(event.target)) {
        setOpen(false);
      }
    });

    for (const item of dropdown.querySelectorAll('.dropdown__item')) {
      item.addEventListener('click', () => setOpen(false));
    }
  }
}
