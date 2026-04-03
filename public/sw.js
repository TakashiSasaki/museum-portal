
// --- Service Worker for Museum Portal ---

// 1. Configuration
// --------------------------------------------------

const CORE_CACHE_VERSION = 'v15'; // Refactored color picker logic
const API_CACHE_VERSION = 'v2';

const CORE_CACHE_NAME = `museum-portal-core-${CORE_CACHE_VERSION}`;
const API_CACHE_NAME = `museum-portal-api-${API_CACHE_VERSION}`;

const API_URL = 'https://script.google.com/macros/s/AKfycbyhraKi6oqu33iU1VNa9cSP4Oi9K7Kb7g3GrEOSjAUiqK7oELrhuCaAK2ElN4tneWUA/exec';

const CORE_ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.css',
  '/index.js',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.png',
  '/museum-street/',
  '/museum-street/index.html',
  '/museum-street/script.js',
  '/museum-street/style.css',
  '/museum-street/events/01-events.html',
  '/museum-street/events/02-events.html',
  '/museum-street/events/03-events.html',
  '/museum-street/events/04-events.html',
  '/museum-street/events/05-events.html',
  '/museum-street/events/06-events.html',
  '/museum-street/events/07-events.html',
  '/museum-street/events/08-events.html',
  '/museum-street/events/09-events.html',
  '/museum-street/events/10-events.html',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;700&display=swap',
  'https://unpkg.com/lucide@latest',
  '/renkei/',
  '/renkei/index.html',
  '/renkei/index.css',
  '/renkei/index.js'
];

// 2. Event Listeners
// --------------------------------------------------

self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install event started.');
  evt.waitUntil(
    caches.open(CORE_CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching core application shell assets...');
      const cachePromises = CORE_ASSETS_TO_CACHE.map((assetUrl) => {
        return (async () => {
          try {
            const request = assetUrl.startsWith('http')
              ? new Request(assetUrl, { mode: 'no-cors' })
              : new Request(assetUrl);
            // Use { cache: 'reload' } to ensure we get fresh content from the server
            const response = await fetch(request, { cache: 'reload' });
            if (response.status === 200 || response.type === 'opaque') {
              await cache.put(assetUrl, response);
            } else {
              console.warn(`[ServiceWorker] Skipped caching ${assetUrl} - non-ok status: ${response.status}`);
            }
          } catch (err) {
            console.warn(`[ServiceWorker] Failed to fetch and cache '${assetUrl}'.`, err);
          }
        })();
      });
      return Promise.all(cachePromises);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate event started.');
  const currentCaches = [CORE_CACHE_NAME, API_CACHE_NAME];
  evt.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log(`[ServiceWorker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Activation complete. Starting API pre-caching in background.');
      precacheApiContent();
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  const { request } = evt;

  // Strategy 0: Ignore Firestore and other Google API requests.
  // Let the Firebase SDK handle these requests with its own offline logic.
  if (request.url.includes('googleapis.com')) {
    return;
  }

  // Let non-GET requests (like potential future POSTs) pass through without interference.
  if (request.method !== 'GET') {
    return;
  }

  // Strategy 1: API requests for iframe content (Cache-First)
  if (request.url.startsWith(API_URL)) {
    evt.respondWith(handleApiRequest(request));
    return;
  }

  // Strategy 2: Navigation requests (Network-first, then cache, then offline page)
  if (request.mode === 'navigate') {
    evt.respondWith(handleNavigationRequest(request));
    return;
  }

  // Strategy 3: Static assets (CSS, JS, Fonts, Images) (Cache-first)
  evt.respondWith(handleStaticAssetRequest(request));
});


// 3. Caching Strategy Implementations
// --------------------------------------------------

/**
 * Handles API requests (for iframe content) with a "Cache First" strategy.
 */
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    return new Response('Content failed to load. Please check your connection.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Handles navigation requests with a "Network First" strategy.
 */
async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-cache' });

    const cache = await caches.open(CORE_CACHE_NAME);
    await cache.put(request, networkResponse.clone());

    return networkResponse;
  } catch (error) {
    console.log(`[ServiceWorker] Network failed for navigation. Trying cache for: ${request.url}`);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return caches.match('/offline.html');
  }
}

/**
 * Handles static asset requests with a "Network First" strategy.
 * Always tries to fetch from the network and updates the cache if successful.
 * Falls back to cache if the network fails.
 */
async function handleStaticAssetRequest(request) {
  try {
    // 1. Try to fetch from the network (bypass browser cache to be sure)
    const networkResponse = await fetch(request);

    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
      // 2. Success! Update the cache with the fresh content
      const cache = await caches.open(CORE_CACHE_NAME);
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }

    // Fallback to cache if network response is not OK (e.g. 404, 500)
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    return cachedResponse || networkResponse;
  } catch (e) {
    // 3. Network failure (offline) - Fallback to cache
    console.log(`[SW] Network failed for ${request.url}. Falling back to cache.`);
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(`Offline: Failed to fetch ${request.url}`, { status: 503 });
  }
}

// 4. Utility Functions
// --------------------------------------------------

/**
 * Fetches and caches the first 10 pages of API content in the background.
 */
async function precacheApiContent() {
  console.log('[ServiceWorker] Starting background API pre-caching for pages 1-10.');
  const cache = await caches.open(API_CACHE_NAME);

  for (let i = 1; i <= 10; i++) {
    const url = `${API_URL}?page=${i}&mime=text/plain`;
    const request = new Request(url);

    const cachedResponse = await cache.match(request);
    if (!cachedResponse) {
      console.log(`[ServiceWorker] Pre-caching API content for page ${i}`);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          await cache.put(request, networkResponse);
        }
      } catch (e) {
        console.warn(`[ServiceWorker] Failed to pre-cache API content for page ${i}`, e);
      }
    }
  }
  console.log('[ServiceWorker] Background API pre-caching finished.');
}
