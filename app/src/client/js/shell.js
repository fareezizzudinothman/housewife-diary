import { initTheme, getThemeState, cycleColorMode, setSidebar } from './theme/engine.js';
import { hydrateIcons, icon } from './components/icon.js';
import { initDropdown } from './components/dropdown.js';
import { logoutUser } from './api/auth.js';
import { currentSession, loadSession, clearCachedSession } from './state/session.js';

/* Shared app chrome — renders the topbar/sidebar/bottom-nav into
   [data-shell="…"] placeholders, wires the theme toggle, sidebar toggle,
   account menu and current-page marking. Pages call initShell() once. */

const NAV_ITEMS = [
  { href: '/pages/dashboard-preview.html', label: 'Dashboard', icon: 'grid' },
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/pages/household.html', label: 'Household', icon: 'users' },
  { href: '/pages/appearance.html', label: 'Appearance', icon: 'palette' },
  { href: '/pages/profile.html', label: 'Profile', icon: 'user' },
];

const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => item.href !== '/');

const MODE_ICONS = { SYSTEM: 'monitor', LIGHT: 'sun', DARK: 'moon' };
const MODE_LABELS = {
  SYSTEM: 'Color mode: system',
  LIGHT: 'Color mode: light',
  DARK: 'Color mode: dark',
};

function currentPath() {
  const path = window.location.pathname;
  return path.endsWith('/index.html') ? '/' : path;
}

function isCurrent(href) {
  const path = currentPath();
  return href === '/' ? path === '/' : path === href;
}

function navLink(item) {
  const current = isCurrent(item.href) ? ' aria-current="page"' : '';
  return `<a class="app-nav__link" href="${item.href}"${current}>${icon(item.icon)}<span class="app-nav__label">${item.label}</span></a>`;
}

function bottomLink(item) {
  const current = isCurrent(item.href) ? ' aria-current="page"' : '';
  return `<a class="app-bottomnav__link" href="${item.href}"${current}>${icon(item.icon)}<span>${item.label}</span></a>`;
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function themeToggleMarkup() {
  const mode = getThemeState().colorMode;
  return `
    <button type="button" class="icon-btn" data-theme-toggle aria-label="${MODE_LABELS[mode]} — click to change">
      ${icon(MODE_ICONS[mode])}
    </button>`;
}

function renderChrome() {
  const topbar = document.querySelector('[data-shell="topbar"]');
  if (topbar) {
    topbar.innerHTML = `
      <a class="app-topbar__brand" href="/">${icon('brand')}<span>Housewife Diary</span></a>
      <span class="app-topbar__title">${document.body.dataset.pageTitle ?? ''}</span>
      <div class="app-topbar__actions">
        <button type="button" class="icon-btn" data-sidebar-toggle aria-label="Toggle navigation rail">${icon('menu')}</button>
        ${themeToggleMarkup()}
        <div class="dropdown" data-dropdown>
          <button type="button" class="icon-btn" data-dropdown-trigger aria-haspopup="true" aria-expanded="false" aria-label="Account menu">
            <span class="avatar" data-user-chip>·</span>
          </button>
          <div class="dropdown__menu">
            <div class="dropdown__header" data-user-header hidden>
              <strong></strong><small></small>
            </div>
            <a class="dropdown__item" href="/pages/profile.html">${icon('user')} Profile</a>
            <a class="dropdown__item" href="/pages/appearance.html">${icon('palette')} Appearance</a>
            <div class="dropdown__divider"></div>
            <button type="button" class="dropdown__item dropdown__item--danger" data-signout>${icon('log-out')} Sign out</button>
          </div>
        </div>
      </div>`;
  }

  const sidebar = document.querySelector('[data-shell="sidebar"]');
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="app-nav">
        <p class="app-nav__section">Your home</p>
        ${NAV_ITEMS.map(navLink).join('')}
      </div>`;
  }

  const bottom = document.querySelector('[data-shell="bottomnav"]');
  if (bottom) {
    bottom.innerHTML = BOTTOM_NAV_ITEMS.map(bottomLink).join('');
  }
}

function refreshThemeToggles() {
  const mode = getThemeState().colorMode;
  for (const toggle of document.querySelectorAll('[data-theme-toggle]')) {
    const use = toggle.querySelector('use');
    if (use) {
      use.setAttribute('href', `/icons/sprite.svg#i-${MODE_ICONS[mode]}`);
    } else {
      toggle.insertAdjacentHTML('beforeend', icon(MODE_ICONS[mode]));
    }
    toggle.setAttribute('aria-label', `${MODE_LABELS[mode]} — click to change`);
  }
}

function wireThemeToggles() {
  for (const toggle of document.querySelectorAll('[data-theme-toggle]')) {
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        await cycleColorMode();
        refreshThemeToggles();
      } catch {
        // Preference still applied locally; server sync can retry next time.
      } finally {
        toggle.disabled = false;
      }
    });
  }
  refreshThemeToggles();
}

function wireSidebarToggle() {
  const toggle = document.querySelector('[data-sidebar-toggle]');
  if (!toggle) {
    return;
  }
  toggle.addEventListener('click', () => {
    setSidebar(getThemeState().sidebar !== 'collapsed');
  });
}

function wireSignOut() {
  for (const button of document.querySelectorAll('[data-signout]')) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await logoutUser();
      } finally {
        clearCachedSession();
        window.location.assign('/');
      }
    });
  }
}

export function updateUserChip(user) {
  if (!user) {
    return;
  }
  const chip = document.querySelector('[data-user-chip]');
  if (chip) {
    chip.textContent = initials(user.name);
    chip.setAttribute('title', user.name);
  }
  const header = document.querySelector('[data-user-header]');
  if (header) {
    header.hidden = false;
    header.querySelector('strong').textContent = user.name;
    header.querySelector('small').textContent = user.email;
  }
}

async function loadUserChip() {
  const session = currentSession();
  if (session?.user) {
    updateUserChip(session.user);
    return;
  }
  try {
    const fresh = await loadSession();
    if (fresh?.user) {
      updateUserChip(fresh.user);
    }
  } catch {
    // Not signed in (or session endpoint unavailable) — chip stays generic.
  }
}

export async function initShell({ withUser = true } = {}) {
  await initTheme();
  renderChrome();
  hydrateIcons(document);
  wireThemeToggles();
  wireSidebarToggle();
  wireSignOut();
  initDropdown(document);
  if (withUser) {
    await loadUserChip();
  }
}
