/* First-paint theme boot — plain blocking script (no modules) so it runs
   before the page renders. Restores the cached appearance saved by
   js/theme/engine.js; without a cache it falls back to system color mode
   plus the static preset in css/themes.css. CSP: served as /js/theme/boot.js. */
(function () {
  var STORAGE_KEY = 'hd.theme.v1';
  var root = document.documentElement;
  var state = null;

  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (error) {
    state = null;
  }

  var colorMode = (state && state.colorMode) || 'SYSTEM';
  var presetMode = (state && state.presetMode) || 'BOTH';
  var dark;
  if (presetMode === 'DARK') {
    // Dark-locked preset (e.g. Midnight) ignores the color-mode preference.
    dark = true;
  } else if (colorMode === 'DARK') {
    dark = true;
  } else if (colorMode === 'LIGHT') {
    dark = false;
  } else {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (error) {
      dark = false;
    }
  }

  root.setAttribute('data-color-mode', dark ? 'dark' : 'light');
  root.setAttribute('data-density', (state && state.density) || 'comfortable');
  root.setAttribute('data-nav-style', (state && state.navStyle) || 'sidebar');
  root.setAttribute('data-sidebar', (state && state.sidebar) || 'expanded');
  if (state && state.slug) {
    root.setAttribute('data-theme', state.slug);
  }

  // vars: { light: {…}, dark: {…} } — preset tokens merged with overrides.
  var vars = state && state.vars;
  if (vars) {
    var map = (dark ? vars.dark : vars.light) || vars.light || vars.dark;
    if (map) {
      for (var key in map) {
        if (Object.prototype.hasOwnProperty.call(map, key)) {
          root.style.setProperty(key, map[key]);
        }
      }
    }
  }

  var onColors = state && state.onColors;
  if (onColors) {
    if (onColors.primary) {
      root.style.setProperty('--color-on-primary', onColors.primary);
    }
    if (onColors.danger) {
      root.style.setProperty('--color-on-danger', onColors.danger);
    }
  }
})();
