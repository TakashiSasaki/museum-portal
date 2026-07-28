
// --- Service Worker for Museum Portal ---

// 1. Configuration
// --------------------------------------------------

const CORE_CACHE_VERSION = 'v27'; // Network-first watchdog assets
const API_CACHE_VERSION = 'v4'; // TTL 20h

const CORE_CACHE_NAME = `museum-portal-core-${CORE_CACHE_VERSION}`;
const API_CACHE_NAME = `museum-portal-api-${API_CACHE_VERSION}`;

const API_CACHE_MAX_AGE_MS = 20 * 60 * 60 * 1000; // 20 hours

const API_URL = 'https://script.google.com/macros/s/AKfycbyhraKi6oqu33iU1VNa9cSP4Oi9K7Kb7g3GrEOSjAUiqK7oELrhuCaAK2ElN4tneWUA/exec';

const NETWORK_FIRST_ASSET_PATHS = new Set([
  '/imaginedeck/watchdog.js',
  '/imaginedeck/heartbeat.js'
]);

const CORE_ASSETS_TO_CACHE = [
  '/',
  '/resume-guard.js',
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

  // Strategy 0: Ignore external APIs and feeds that should not be cached by SW.
  // Let the Firebase SDK handle googleapis with its own offline logic.
  // Skip imagine deck feeds so they always bypass and load fresh.
  if (
    request.url.includes('googleapis.com') ||
    request.url.includes('imaginedeck.igsrr.org/feed/')
  ) {
    return;
  }

  // Let non-GET requests (like potential future POSTs) pass through without interference.
  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  // Strategy 1: Watchdog protocol assets (Network-first, then stable cached fallback)
  if (
    requestUrl.origin === self.location.origin &&
    NETWORK_FIRST_ASSET_PATHS.has(requestUrl.pathname)
  ) {
    evt.respondWith(handleNetworkFirstAssetRequest(request));
    return;
  }

  // Strategy 2: API requests for iframe content (Cache-First)
  if (request.url.startsWith(API_URL)) {
    evt.respondWith(handleApiRequest(request));
    return;
  }

  // Strategy 3: Navigation requests (Network-first, then cache, then offline page)
  if (request.mode === 'navigate') {
    evt.respondWith(handleNavigationRequest(request));
    return;
  }

  // Strategy 4: Static assets (CSS, JS, Fonts, Images) (Stale-While-Revalidate)
  evt.respondWith(handleStaticAssetRequest(request, evt));
});


// 3. Caching Strategy Implementations
// --------------------------------------------------

/**
 * Creates a new Response object with a custom X-Cache-Fetched-At header.
 */
async function createResponseWithFetchTime(response) {
  const headers = new Headers(response.headers);
  headers.append('X-Cache-Fetched-At', Date.now().toString());

  // We need to read the body as a Blob to create a new Response
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

/**
 * Handles watchdog protocol assets with a "Network First" strategy.
 * Stable cache keys avoid duplicate entries if a query string is added later.
 */
async function handleNetworkFirstAssetRequest(request) {
  const requestUrl = new URL(request.url);
  requestUrl.search = '';
  requestUrl.hash = '';

  const stableRequest = new Request(requestUrl.href);
  const cache = await caches.open(CORE_CACHE_NAME);

  try {
    const networkResponse = await fetch(request, { cache: 'no-cache' });

    if (networkResponse && networkResponse.status === 200) {
      await cache.put(stableRequest, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log(`[ServiceWorker] Network failed for watchdog asset. Trying cache for: ${request.url}`);
    const cachedResponse = await cache.match(stableRequest);

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response(`Offline: Failed to fetch ${request.url}`, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Handles API requests (for iframe content) with a "Cache First" strategy.
 */
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    const fetchedAtHeader = cachedResponse.headers.get('X-Cache-Fetched-At');
    const dateHeader = cachedResponse.headers.get('Date');

    let cachedAt = 0;
    if (fetchedAtHeader) {
      cachedAt = parseInt(fetchedAtHeader, 10);
    } else if (dateHeader) {
      cachedAt = new Date(dateHeader).getTime();
    }

    const isExpired = (Date.now() - cachedAt) > API_CACHE_MAX_AGE_MS;

    if (!isExpired) {
      return cachedResponse;
    }
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse && networkResponse.status === 200) {
      // Create a cloned response with the custom fetch time header
      const responseToCache = await createResponseWithFetchTime(networkResponse.clone());
      await cache.put(request, responseToCache);
    }

    return networkResponse;
  } catch (error) {
    // If network fails (offline), return the expired cache as a fallback if it exists
    if (cachedResponse) {
      console.log(`[ServiceWorker] Network failed for API. Returning expired cache.`);
      return cachedResponse;
    }
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
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) {
      return cachedResponse;
    }
    return caches.match('/offline.html');
  }
}

/**
 * Handles static asset requests with a "Stale-While-Revalidate" strategy.
 * Returns the cached response immediately if available, while simultaneously
 * fetching from the network in the background to update the cache.
 */
async function handleStaticAssetRequest(request, evt) {
  const cachedResponse = await caches.match(request, { ignoreSearch: true });

  const networkFetchPromise = (async () => {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
        const cache = await caches.open(CORE_CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (e) {
      console.log(`[SW] Network failed for ${request.url}.`, e);
      if (!cachedResponse) {
        return new Response(`Offline: Failed to fetch ${request.url}`, { status: 503 });
      }
      throw e;
    }
  })();

  if (cachedResponse) {
    // If we have a cache, return it immediately and let the network fetch run in the background
    if (evt && evt.waitUntil) {
      evt.waitUntil(networkFetchPromise.catch(() => {}));
    }
    return cachedResponse;
  }

  // If no cache, wait for the network response
  return networkFetchPromise;
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
    let isExpired = true;
    if (cachedResponse) {
      const fetchedAtHeader = cachedResponse.headers.get('X-Cache-Fetched-At');
      const dateHeader = cachedResponse.headers.get('Date');

      let cachedAt = 0;
      if (fetchedAtHeader) {
        cachedAt = parseInt(fetchedAtHeader, 10);
      } else if (dateHeader) {
        cachedAt = new Date(dateHeader).getTime();
      }

      isExpired = (Date.now() - cachedAt) > API_CACHE_MAX_AGE_MS;
    }

    if (!cachedResponse || isExpired) {
      console.log(`[ServiceWorker] Pre-caching API content for page ${i}${isExpired && cachedResponse ? ' (expired)' : ''}`);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = await createResponseWithFetchTime(networkResponse.clone());
          await cache.put(request, responseToCache);
        }
      } catch (e) {
        console.warn(`[ServiceWorker] Failed to pre-cache API content for page ${i}`, e);
      }

      // Wait for 1 second before fetching the next page to prevent overwhelming the server or causing issues on certain devices
      if (i < 10) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  console.log('[ServiceWorker] Background API pre-caching finished.');
}
