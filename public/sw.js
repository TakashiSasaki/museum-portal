
// --- Service Worker for Museum Portal ---

// 1. Configuration
// --------------------------------------------------

// Cache versioning. Increment this to force an update of cached core assets.
const CORE_CACHE_VERSION = 'v4'; // Incremented due to new assets
const API_CACHE_VERSION = 'v1';

const CORE_CACHE_NAME = `museum-portal-core-${CORE_CACHE_VERSION}`;
const API_CACHE_NAME = `museum-portal-api-${API_CACHE_VERSION}`;

// The base URL for the API content
const API_URL = 'https://script.google.com/macros/s/AKfycbyhraKi6oqu33iU1VNa9cSP4Oi9K7Kb7g3GrEOSjAUiqK7oELrhuCaAK2ElN4tneWUA/exec';

// Assets that are fundamental to the app's shell
const CORE_ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.png',
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
  // Font for main page
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap',
  // Font for event pages
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;700&display=swap',
  'https://unpkg.com/lucide@latest'
];

// API cache settings
const API_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

// 2. Event Listeners
// --------------------------------------------------

// INSTALL: Cache the core assets of the application shell.
self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install event started.');
  evt.waitUntil(
    caches.open(CORE_CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching core application shell assets...');
      return cache.addAll(CORE_ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Activate the new service worker immediately.
});

// ACTIVATE: Clean up old caches and start delayed pre-caching.
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
      // Start pre-caching API content in the background *after* activation.
      // This does not block the activation process.
      console.log('[ServiceWorker] Activation complete. Starting API pre-caching in background.');
      precacheApiContent();
    })
  );
  self.clients.claim(); // Take control of all open clients.
});

// FETCH: Intercept network requests to apply caching strategies.
self.addEventListener('fetch', (evt) => {
  // Strategy for API requests: Cache with TTL, falling back to network, with a final fallback to stale cache.
  if (evt.request.url.startsWith(API_URL)) {
    evt.respondWith(handleApiRequest(evt.request));
  }
  // Strategy for non-API requests: Cache first, falling back to network.
  else {
    evt.respondWith(handleNonApiRequest(evt.request, evt));
  }
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
    // If there's nothing in cache and network fails, return an error response.
    return new Response(JSON.stringify({ error: 'Offline and no data in cache.' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handles non-API requests with a "Cache First" strategy.
 * Ideal for application shell assets that only change with new deployments.
 */
async function handleNonApiRequest(request, evt) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Fallback to network if not in cache (e.g., for assets not in the initial cache list)
  try {
        const networkResponse = await fetch(request);
        // Don't cache all dynamic non-API requests by default, but you could add logic here if needed.
        return networkResponse;
    } catch (error) {
        // For page navigation requests, show the offline page.
        if (request.mode === 'navigate') {
            const offlinePage = await caches.match('/offline.html');
            return offlinePage;
        }
        // For other assets (images, etc.), just fail.
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
 * This runs after the service worker is activated to avoid delaying initial page load.
 */
async function precacheApiContent() {
  console.log('[ServiceWorker] Starting background API pre-caching for pages 1-10.');
  const cache = await caches.open(API_CACHE_NAME);
  const promises = [];

  for (let i = 1; i <= 10; i++) {
    const url = `${API_URL}?page=${i}&mime=text/plain`;
    const request = new Request(url);

    const promise = cache.match(request).then(async (cachedResponse) => {
      // Only fetch and cache if it's not already in the cache or if it's stale.
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
