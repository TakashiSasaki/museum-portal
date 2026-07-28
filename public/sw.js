
// --- Service Worker for Museum Portal ---

// 1. Configuration
// --------------------------------------------------

const CORE_CACHE_VERSION = 'v30'; // Atomic ImagineDeck asset-set staging
const API_CACHE_VERSION = 'v4'; // TTL 20h

const CORE_CACHE_NAME = `museum-portal-core-${CORE_CACHE_VERSION}`;
const API_CACHE_NAME = `museum-portal-api-${API_CACHE_VERSION}`;
const IMAGINEDECK_ASSET_CACHE_NAME = 'museum-portal-imaginedeck-assets-v1';
const IMAGINEDECK_STAGING_CACHE_NAME = 'museum-portal-imaginedeck-staging-v1';

const API_CACHE_MAX_AGE_MS = 20 * 60 * 60 * 1000; // 20 hours

const API_URL = 'https://script.google.com/macros/s/AKfycbyhraKi6oqu33iU1VNa9cSP4Oi9K7Kb7g3GrEOSjAUiqK7oELrhuCaAK2ElN4tneWUA/exec';

const IMAGINEDECK_REQUIRE_NETWORK_HEADER = 'X-ImagineDeck-Require-Network';
const IMAGINEDECK_STAGE_ONLY_HEADER = 'X-ImagineDeck-Stage-Only';

const NETWORK_FIRST_ASSET_PATHS = new Set([
  '/imaginedeck/app.html',
  '/imaginedeck/index.js',
  '/imaginedeck/index.css',
  '/imaginedeck/mergeFeeds.js',
  '/imaginedeck/heartbeat.js',
  '/imaginedeck/watchdog.js',
  '/imaginedeck/QR_458893.png'
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
  const currentCaches = [
    CORE_CACHE_NAME,
    API_CACHE_NAME,
    IMAGINEDECK_ASSET_CACHE_NAME
  ];

  evt.waitUntil(
    migrateImagineDeckFallbacks()
      .then(() => caches.keys())
      .then((cacheNames) => Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log(`[ServiceWorker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
          return undefined;
        })
      ))
      .then(() => {
        console.log('[ServiceWorker] Activation complete. Starting API pre-caching in background.');
        precacheApiContent();
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (evt) => {
  const { request } = evt;

  if (
    request.url.includes('googleapis.com') ||
    request.url.includes('imaginedeck.igsrr.org/feed/')
  ) {
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  if (
    requestUrl.origin === self.location.origin &&
    NETWORK_FIRST_ASSET_PATHS.has(requestUrl.pathname)
  ) {
    evt.respondWith(handleNetworkFirstAssetRequest(request));
    return;
  }

  if (request.url.startsWith(API_URL)) {
    evt.respondWith(handleApiRequest(request));
    return;
  }

  if (request.mode === 'navigate') {
    evt.respondWith(handleNavigationRequest(request));
    return;
  }

  evt.respondWith(handleStaticAssetRequest(request, evt));
});

// 3. Caching Strategy Implementations
// --------------------------------------------------

function stableImagineDeckRequest(pathOrUrl) {
  const url = new URL(pathOrUrl, self.location.origin);
  url.search = '';
  url.hash = '';
  return new Request(url.href, { credentials: 'same-origin' });
}

async function migrateImagineDeckFallbacks() {
  const assetCache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
  const cacheNames = await caches.keys();

  for (const pathname of NETWORK_FIRST_ASSET_PATHS) {
    const stableRequest = stableImagineDeckRequest(pathname);
    if (await assetCache.match(stableRequest)) {
      continue;
    }

    for (const cacheName of cacheNames) {
      if (
        cacheName === IMAGINEDECK_ASSET_CACHE_NAME ||
        cacheName === IMAGINEDECK_STAGING_CACHE_NAME
      ) {
        continue;
      }

      const cache = await caches.open(cacheName);
      const existingResponse = await cache.match(stableRequest, { ignoreSearch: true });
      if (existingResponse) {
        await assetCache.put(stableRequest, existingResponse.clone());
        break;
      }
    }
  }
}

/**
 * Creates a new Response object with a custom X-Cache-Fetched-At header.
 */
async function createResponseWithFetchTime(response) {
  const headers = new Headers(response.headers);
  headers.append('X-Cache-Fetched-At', Date.now().toString());

  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

/**
 * Handles monitored ImagineDeck resources with network-first delivery.
 * Stage-only requests return real network bytes without mutating the active
 * asset-set cache. The watchdog promotes a complete staged set atomically.
 */
async function handleNetworkFirstAssetRequest(request) {
  const stableRequest = stableImagineDeckRequest(request.url);
  const cache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
  const requireNetwork =
    request.headers.get(IMAGINEDECK_REQUIRE_NETWORK_HEADER) === '1';
  const stageOnly =
    request.headers.get(IMAGINEDECK_STAGE_ONLY_HEADER) === '1';

  try {
    const networkResponse = await fetch(request, { cache: 'reload' });

    if (networkResponse && networkResponse.status === 200) {
      if (!stageOnly) {
        await cache.put(stableRequest, networkResponse.clone());
      }
      return networkResponse;
    }

    if (requireNetwork || stageOnly) {
      return networkResponse;
    }

    const cachedResponse = await cache.match(stableRequest);
    return cachedResponse || networkResponse;
  } catch (error) {
    if (requireNetwork || stageOnly) {
      return new Response(`Network required: Failed to fetch ${request.url}`, {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    console.log(`[ServiceWorker] Network failed for ImagineDeck asset. Trying cache for: ${request.url}`);
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
      const responseToCache = await createResponseWithFetchTime(networkResponse.clone());
      await cache.put(request, responseToCache);
    }

    return networkResponse;
  } catch (error) {
    if (cachedResponse) {
      console.log('[ServiceWorker] Network failed for API. Returning expired cache.');
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
 * Handles other static asset requests with a "Stale-While-Revalidate" strategy.
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
    if (evt && evt.waitUntil) {
      evt.waitUntil(networkFetchPromise.catch(() => {}));
    }
    return cachedResponse;
  }

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

      if (i < 10) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  console.log('[ServiceWorker] Background API pre-caching finished.');
}
