# PWA (Progressive Web App)

## Overview

Housewife Diary is a fully installable Progressive Web App (PWA) that provides an app-like experience on desktop and mobile devices. The PWA implementation includes:

- Web App Manifest for installability
- Service Worker for offline shell caching
- App icons at multiple resolutions
- Safe caching strategy that protects private household data

## Features

### Installability
- **Manifest**: `/manifest.webmanifest` with app metadata, icons, and shortcuts
- **Install Prompt**: Browser-native install prompt on supported browsers
- **Standalone Mode**: Runs in standalone window without browser UI when installed
- **Shortcuts**: Quick access to Dashboard, Tasks, and Calendar from app icon

### Offline Support
- **App Shell Caching**: Core HTML, CSS, JS, and icons cached for offline access
- **Offline Page**: Friendly offline message when network unavailable
- **Navigation Fallback**: Cached pages served when offline

### Caching Strategy

| Resource Type | Strategy | Rationale |
|---------------|----------|-----------|
| Static Assets (JS, CSS, Icons) | Cache-First | Immutable, safe to cache |
| HTML Pages | Network-First + Offline Fallback | Fresh content when online, fallback when offline |
| API Requests | Network-First (Never Cached) | Private household data never cached |
| Static Assets (Fonts, Images) | Cache-First | Safe to cache |

### Security Considerations

**CRITICAL**: Private API responses containing household/user data are NEVER cached. The service worker explicitly excludes all `/api/` paths from caching to prevent data leakage.

```javascript
// API paths that should NEVER be cached
const API_PATHS = [
  '/api/auth/',
  '/api/users/',
  '/api/households/',
  '/api/themes/',
  '/api/diary/',
  '/api/tasks/',
  '/api/calendar/',
  '/api/recipes/',
  '/api/meals/',
  '/api/shopping-lists/',
  '/api/inventory/',
  '/api/finance/',
  '/api/family/',
  '/api/home/',
  '/api/documents/',
  '/api/notes/',
  '/api/ideas/',
  '/api/notifications/',
];
```

### Service Worker Lifecycle

1. **Install**: Caches static assets (shell)
2. **Activate**: Cleans up old caches, claims clients
3. **Fetch**: Routes requests based on path type
4. **Message**: Handles skipWaiting and cache info requests

## Icons

Icons are generated at multiple sizes for different device requirements:

| Size | Purpose |
|------|---------|
| 72×72 | Android legacy |
| 96×96 | Android legacy |
| 128×128 | Chrome Web Store |
| 144×144 | Windows tile |
| 152×152 | iOS Safari |
| 192×192 | Android home screen |
| 384×384 | Android splash |
| 512×512 | High-res displays |

Icons are generated from a single SVG source using a canvas-based script (`scripts/generate-icons.cjs`).

## Manifest

The Web App Manifest (`/manifest.webmanifest`) defines:

```json
{
  "name": "Housewife Diary",
  "short_name": "Housewife Diary",
  "description": "Your personal digital household companion",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#faf9f7",
  "theme_color": "#c96e6e",
  "orientation": "portrait-primary",
  "icons": [...],
  "shortcuts": [
    { "name": "Dashboard", "url": "/pages/dashboard.html" },
    { "name": "Tasks", "url": "/pages/tasks.html" },
    { "name": "Calendar", "url": "/pages/calendar.html" }
  ]
}
```

## Service Worker Registration

The service worker is registered in `app.js` on page load:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => { /* ... */ });
}
```

Updates are detected automatically. When a new version is available, users can refresh to get the latest version.

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Web App Manifest | ✅ | ✅ | ✅ | ✅ |
| Install Prompt | ✅ | ✅ | ⚠️ | ✅ |
| Offline Support | ✅ | ✅ | ✅ | ✅ |
| Shortcuts | ✅ | ❌ | ❌ | ✅ |

## Testing PWA

### Manual Testing Checklist

1. **Installability**
   - [ ] Visit app in Chrome/Edge → install prompt appears
   - [ ] Install app → opens in standalone window
   - [ ] App icon appears on home screen/launcher
   - [ ] Shortcuts work from app icon context menu

2. **Offline**
   - [ ] Open app online → navigate to several pages
   - [ ] Enable Airplane Mode / disconnect network
   - [ ] Refresh page → offline page shown
   - [ ] Navigate to cached pages → content loads
   - [ ] Reconnect → normal operation resumes

3. **Caching**
   - [ ] DevTools → Application → Cache Storage → verify static assets cached
   - [ ] DevTools → Network → API requests → verify NOT cached
   - [ ] DevTools → Application → Service Worker → verify active

4. **Updates**
   - [ ] Deploy new version → refresh → new SW activates
   - [ ] Multiple tabs → update detected across all tabs

### Lighthouse PWA Audit

Run Lighthouse PWA audit to verify:
- [ ] Installable
- [ ] Works offline
- [ ] Fast loading
- [ ] HTTPS
- [ ] Redirects HTTP to HTTPS
- [ ] Manifest valid
- [ ] Service Worker valid
- [ ] Icons valid

## Deferred Features

- Background Sync for pending writes
- Periodic Background Sync for notifications
- Push Notifications (requires VAPID keys)
- App Shortcuts dynamic updates
- Share Target API
- File Handling API
- Badging API
- Window Controls Overlay