// Service Worker for Housewife Diary PWA
// Provides offline shell caching and safe network-first API strategy

const CACHE_NAME = 'housewife-diary-v1';
const STATIC_ASSETS = [
  '/',
  '/pages/dashboard.html',
  '/pages/diary.html',
  '/pages/tasks.html',
  '/pages/calendar.html',
  '/pages/family.html',
  '/pages/home.html',
  '/pages/rooms.html',
  '/pages/cleaning.html',
  '/pages/laundry.html',
  '/pages/maintenance.html',
  '/pages/documents.html',
  '/pages/notes.html',
  '/pages/ideas.html',
  '/pages/recipes.html',
  '/pages/meals.html',
  '/pages/shopping.html',
  '/pages/inventory.html',
  '/pages/finance.html',
  '/pages/budgets.html',
  '/pages/bills.html',
  '/pages/accounts.html',
  '/pages/household.html',
  '/pages/profile.html',
  '/pages/appearance.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// API paths that should NEVER be cached (contain private household data)
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

// Static asset paths that CAN be cached (safe, non-personalized)
const STATIC_PATHS = [
  '/js/',
  '/css/',
  '/icons/',
  '/images/',
];

// Check if a URL is an API path
function isApiPath(url) {
  return API_PATHS.some(path => url.pathname.startsWith(path));
}

// Check if a URL is a static asset path
function isStaticPath(url) {
  return STATIC_PATHS.some(path => url.pathname.startsWith(path));
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - always network-first, never cache
  if (isApiPath(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static assets - cache-first
  if (isStaticPath(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // HTML pages - network-first with offline fallback
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithOfflineFallback(event.request));
    return;
  }

  // Other requests - network-first
  event.respondWith(networkFirst(event.request));
});

// Network-first strategy
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Only cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

// Cache-first strategy
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Update cache in background
    fetch(request).then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    throw error;
  }
}

// Network-first with offline fallback for HTML pages
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Try cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Fallback to offline page
    const offlineCache = await caches.match('/');
    if (offlineCache) {
      return offlineCache;
    }
    // Last resort: return a basic offline response
    return new Response(
      `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Offline — Housewife Diary</title>
        <style>
          body { font-family: system-ui; padding: 2rem; text-align: center; color: #333; }
          .offline { max-width: 400px; margin: 0 auto; }
          h1 { color: #c96e6e; }
        </style>
      </head>
      <body>
        <div class="offline">
          <h1>You're offline</h1>
          <p>Housewife Diary needs an internet connection to sync your household data.</p>
          <p>Please check your connection and try again.</p>
        </div>
      </body>
      </html>`,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'getCacheInfo') {
    caches.open(CACHE_NAME).then((cache) => {
      cache.keys().then((keys) => {
        event.ports[0].postMessage({
          cacheName: CACHE_NAME,
          cachedUrls: keys.map((req) => req.url),
        });
      });
    });
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  // In a full implementation, this would sync pending notifications
  // For now, just log
  console.log('[SW] Periodic sync: notifications');
}