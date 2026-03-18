
// --- Service Worker for Museum Portal ---

// 1. Configuration
// --------------------------------------------------

const CORE_CACHE_VERSION = 'v5'; // Incremented to improve caching strategy
const API_CACHE_VERSION = 'v1';

const CORE_CACHE_NAME = `museum-portal-core-${CORE_CACHE_VERSION}`;
const API_CACHE_NAME = `museum-portal-api-${API_CACHE_VERSION}`;

const API_URL = 'https://script.google.com/macros/s/AKfycbyhraKi6oqu33iU1VNa9cSP4Oi9K7Kb7g3GrEOSjAUiqK7oELrhuCaAK2ElN4tneWUA/exec';

// Assets that are fundamental to the app's shell. These are cached on install.
// Other pages and assets will be cached on-the-fly when visited.
const CORE_ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.png',
  // Key museum street pages and assets
  '/museum-street/',
  '/museum-street/index.html',
  '/museum-street/script.js',
  '/museum-street/style.css',
  // All event pages
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
  // External assets
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;700&display=swap',
  'https://unpkg.com/lucide@latest'
];

const API_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

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
            const response = await fetch(request);
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

// FETCH: Intercept network requests to apply caching strategies.
self.addEventListener('fetch', (evt) => {
  const { request } = evt;

  // Strategy 1: API requests (Cache with TTL, falling back to network)
  if (request.url.startsWith(API_URL)) {
    evt.respondWith(handleApiRequest(request));
    return;
  }

  // Strategy 2: Navigation requests (Network-first, then cache, then offline page)
  if (request.mode === 'navigate') {
    evt.respondWith(
      (async () => {
        try {
          // Try network first
          const networkResponse = await fetch(request);

          // If successful, cache the response for future offline use
          const cache = await caches.open(CORE_CACHE_NAME);
          cache.put(request, networkResponse.clone());
          
          return networkResponse;
        } catch (error) {
          // If network fails, try to serve from the cache
          console.log(`[ServiceWorker] Network failed for navigation to ${request.url}. Trying cache.`);
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            console.log(`[ServiceWorker] Serving navigation from cache: ${request.url}`);
            return cachedResponse;
          }
          // If not in cache, serve the generic offline page
          console.log(`[ServiceWorker] No cache match for navigation. Serving offline fallback page.`);
          return caches.match('/offline.html');
        }
      })()
    );
    return;
  }

  // Strategy 3: Static assets (CSS, JS, Fonts, Images) (Cache-first, then network and update)
  evt.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
      
      const networkResponse = await fetch(request);
      // For external assets fetched with no-cors, we get an opaque response.
      // We should cache these as they are important for the app shell.
      if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
        const cache = await caches.open(CORE_CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })()
  );
});


// 3. Caching Strategies
// --------------------------------------------------

/**
 * Handles API requests with a "Cache falling back to Network" strategy with a Time-To-Live (TTL).
 * 1. Try to serve a FRESH response from the cache (younger than 1 hour).
 * 2. If not available, fetch from the network and update the cache.
 * 3. If network fails, serve a STALE response from the cache as a last resort.
 */
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    const cacheTimestamp = new Date(cachedResponse.headers.get('date')).getTime();
    const isFresh = (Date.now() - cacheTimestamp) < API_CACHE_MAX_AGE_MS;
    if (isFresh) {
      console.log(`[ServiceWorker] API CACHE HIT (FRESH): ${request.url}`);
      return cachedResponse;
    }
  }

  console.log(`[ServiceWorker] API CACHE MISS or STALE. Fetching from network: ${request.url}`);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      await cacheApiResponse(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn(`[ServiceWorker] Network fetch failed for ${request.url}.`, error);
    if (cachedResponse) {
      console.log(`[ServiceWorker] Serving STALE response from cache as fallback: ${request.url}`);
      return cachedResponse; // Fallback to the old, stale response.
    }
    return new Response(JSON.stringify({ error: 'Offline and no data in cache.' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 4. Utility Functions
// --------------------------------------------------

/**
 * Clones a response, adds a 'date' header, and puts it into the API cache.
 */
async function cacheApiResponse(request, response) {
  const cache = await caches.open(API_CACHE_NAME);
  const responseToCache = response.clone();
  
  const modifiableHeaders = new Headers();
  responseToCache.headers.forEach((value, key) => {
    modifiableHeaders.append(key, value);
  });
  modifiableHeaders.set('date', new Date().toUTCString());

  const cacheableBody = await responseToCache.blob();
  const cacheableResponse = new Response(cacheableBody, {
    status: response.status,
    statusText: response.statusText,
    headers: modifiableHeaders
  });

  console.log(`[ServiceWorker] Caching API response for: ${request.url}`);
  await cache.put(request, cacheableResponse);
}

/**
 * Fetches and caches the first 10 pages of API content in the background.
 */
async function precacheApiContent() {
  console.log('[ServiceWorker] Starting background API pre-caching for pages 1-10.');
  const cache = await caches.open(API_CACHE_NAME);
  const promises = [];

  for (let i = 1; i <= 10; i++) {
    const url = `${API_URL}?page=${i}&mime=text/plain`;
    const request = new Request(url);

    const promise = cache.match(request).then(async (cachedResponse) => {
      let isStale = true;
      if (cachedResponse) {
          const cacheTimestamp = new Date(cachedResponse.headers.get('date')).getTime();
          isStale = (Date.now() - cacheTimestamp) > API_CACHE_MAX_AGE_MS;
      }

      if (!cachedResponse || isStale) {
        console.log(`[ServiceWorker] Pre-caching API content for page ${i}`);
        try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200) {
               await cacheApiResponse(request, networkResponse);
            }
        } catch(e) {
            console.warn(`[ServiceWorker] Failed to pre-cache API content for page ${i}`, e);
        }
      }
    });
    promises.push(promise);
  }

  await Promise.all(promises);
  console.log('[ServiceWorker] Background API pre-caching finished.');
}
