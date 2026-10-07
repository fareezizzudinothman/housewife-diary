import { icon } from './icon.js';

/* Accessible modal dialog — Escape and backdrop close it, focus moves in
   on open and returns to the trigger on close. */

export function openModal({ title, body = '', actions = [], onClose } = {}) {
  const previousFocus = document.activeElement;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal__head">
        <h2 id="modal-title"></h2>
        <button type="button" class="icon-btn" data-modal-close aria-label="Close dialog">${icon('x')}</button>
      </div>
      <div class="modal__body"></div>
      <div class="modal__actions"></div>
    </div>`;

  backdrop.querySelector('#modal-title').textContent = title;
  const bodyHost = backdrop.querySelector('.modal__body');
  if (typeof body === 'string') {
    bodyHost.innerHTML = body;
  } else if (body instanceof Node) {
    bodyHost.appendChild(body);
  }

  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
    if (onClose) {
      onClose();
    }
  };

  const actionsHost = backdrop.querySelector('.modal__actions');
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${action.variant ? `btn--${action.variant}` : 'btn--ghost'}`;
    button.textContent = action.label;
    button.addEventListener('click', async () => {
      if (action.onClick) {
        await action.onClick({ close });
      } else {
        close();
      }
    });
    actionsHost.appendChild(button);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusables = backdrop.querySelectorAll('button, [href], input, select, textarea');
    if (!focusables.length) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      close();
    }
  });
  backdrop.querySelector('[data-modal-close]').addEventListener('click', close);

  document.body.appendChild(backdrop);
  const focusTarget =
    actionsHost.querySelector('button') || backdrop.querySelector('[data-modal-close]');
  focusTarget.focus();

  return { close };
}

// Confirmation dialog — resolves true when confirmed, false otherwise.
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const body = document.createElement('p');
    body.textContent = message;
    openModal({
      title,
      body,
      onClose: () => settle(false),
      actions: [
        {
          label: cancelLabel,
          variant: 'ghost',
          onClick: ({ close }) => {
            settle(false);
            close();
          },
        },
        {
          label: confirmLabel,
          variant: danger ? 'danger' : 'primary',
          onClick: ({ close }) => {
            settle(true);
            close();
          },
        },
      ],
    });
  });
}
