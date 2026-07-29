(() => {
  'use strict';

  const ORCHESTRATOR_VERSION = 43;
  const STORAGE_GENERATION_VERSION = 36;
  const ACTIVE_POINTER_CACHE_NAME =
    `${IMAGINEDECK_PIN_CACHE_PREFIX}generation-pointer-v${STORAGE_GENERATION_VERSION}`;
  const GENERATION_CACHE_PREFIX =
    `${IMAGINEDECK_PIN_CACHE_PREFIX}generation-v${STORAGE_GENERATION_VERSION}-`;
  const ACTIVE_POINTER_REQUEST = new Request(
    new URL(
      `/__imaginedeck-active-generation-v${STORAGE_GENERATION_VERSION}__`,
      self.location.origin
    ).href
  );
  const MAX_STABLE_FETCH_ATTEMPTS = 3;
  const REFRESH_BUDGET_MS = 15_000;
  const RETRY_DELAY_SECONDS = 1;
  const GENERATION_RETENTION_MS = 24 * 60 * 60 * 1000;
  const baseHandleNetworkFirstAssetRequest = handleNetworkFirstAssetRequest;
  let boundedStableRefreshPromise = null;

  function serviceUnavailable(message) {
    return new Response(message, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store'
      }
    });
  }

  function retryingNavigationUnavailable(message) {
    const escapedMessage = String(message)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="refresh" content="${RETRY_DELAY_SECONDS}">` +
      `<meta name="robots" content="noindex"></head>` +
      `<body><p>${escapedMessage}</p>` +
      `<script>setTimeout(() => location.reload(), ${RETRY_DELAY_SECONDS * 1000});</script>` +
      `</body></html>`,
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Retry-After': String(RETRY_DELAY_SECONDS)
        }
      }
    );
  }

  function generationCacheName() {
    return (
      `${GENERATION_CACHE_PREFIX}${Date.now()}-` +
      Math.random().toString(36).slice(2)
    );
  }

  function throwIfAborted(signal) {
    if (signal.aborted) {
      throw signal.reason || new Error('ImagineDeck generation refresh was aborted.');
    }
  }

  async function readGenerationEntries(cacheName) {
    if (
      typeof cacheName !== 'string' ||
      !cacheName.startsWith(GENERATION_CACHE_PREFIX)
    ) {
      return null;
    }

    const cache = await caches.open(cacheName);
    const entries = await Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(async pathname => {
        const request = stableImagineDeckRequest(pathname);
        const response = await cache.match(request);
        return response ? { request, response } : null;
      })
    );
    return entries.every(Boolean) ? entries : null;
  }

  async function readActiveGenerationPointer() {
    const pointerCache = await caches.open(ACTIVE_POINTER_CACHE_NAME);
    const response = await pointerCache.match(ACTIVE_POINTER_REQUEST);
    if (!response) {
      return null;
    }

    try {
      const pointer = await response.json();
      if (
        typeof pointer.cacheName !== 'string' ||
        !pointer.cacheName.startsWith(GENERATION_CACHE_PREFIX) ||
        typeof pointer.signature !== 'string' ||
        typeof pointer.createdAt !== 'number'
      ) {
        throw new Error('Invalid ImagineDeck generation pointer metadata.');
      }

      const entries = await readGenerationEntries(pointer.cacheName);
      if (!entries) {
        throw new Error('The pointed ImagineDeck generation is incomplete.');
      }
      const signature = await imagineDeckGenerationSignature(entries);
      if (signature !== pointer.signature) {
        throw new Error('The pointed ImagineDeck generation signature is invalid.');
      }
      return { ...pointer, entries };
    } catch (error) {
      console.warn(
        '[ServiceWorker] Discarding an invalid ImagineDeck generation pointer.',
        error
      );
      await pointerCache.delete(ACTIVE_POINTER_REQUEST);
      return null;
    }
  }

  async function writeActiveGenerationPointer(cacheName, signature) {
    const pointerCache = await caches.open(ACTIVE_POINTER_CACHE_NAME);
    const pointer = { cacheName, signature, createdAt: Date.now() };
    await pointerCache.put(
      ACTIVE_POINTER_REQUEST,
      new Response(JSON.stringify(pointer), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    return pointer;
  }

  async function cleanupOldGenerationCaches(activeCacheName) {
    const now = Date.now();
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(async cacheName => {
        if (
          cacheName === activeCacheName ||
          !cacheName.startsWith(GENERATION_CACHE_PREFIX)
        ) {
          return;
        }
        const suffix = cacheName.slice(GENERATION_CACHE_PREFIX.length);
        const createdAt = Number.parseInt(suffix.split('-')[0], 10);
        if (
          Number.isFinite(createdAt) &&
          now - createdAt > GENERATION_RETENTION_MS
        ) {
          await caches.delete(cacheName);
        }
      })
    );
  }

  async function mirrorGenerationForLegacyWatchdog(entries) {
    const mirrorCache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
    for (const entry of entries) {
      await mirrorCache.put(entry.request, entry.response.clone());
    }
  }

  async function publishImmutableGeneration(entries, signature, signal) {
    throwIfAborted(signal);
    const cacheName = generationCacheName();
    const generationCache = await caches.open(cacheName);

    try {
      for (const entry of entries) {
        throwIfAborted(signal);
        await generationCache.put(entry.request, entry.response.clone());
      }

      throwIfAborted(signal);
      const storedEntries = await readGenerationEntries(cacheName);
      if (!storedEntries) {
        throw new Error('Published ImagineDeck generation is incomplete.');
      }
      const storedSignature = await imagineDeckGenerationSignature(storedEntries);
      if (storedSignature !== signature) {
        throw new Error('Published ImagineDeck generation signature changed.');
      }

      throwIfAborted(signal);
      const pointer = await writeActiveGenerationPointer(cacheName, signature);
      try {
        await mirrorGenerationForLegacyWatchdog(storedEntries);
      } catch (error) {
        console.warn(
          '[ServiceWorker] Failed to update the legacy ImagineDeck watchdog mirror.',
          error
        );
      }
      void cleanupOldGenerationCaches(cacheName).catch(error => {
        console.warn('[ServiceWorker] Failed to clean old ImagineDeck generations.', error);
      });
      return { ...pointer, entries: storedEntries };
    } catch (error) {
      const pointer = await readActiveGenerationPointer().catch(() => null);
      if (!pointer || pointer.cacheName !== cacheName) {
        await caches.delete(cacheName);
      }
      throw error;
    }
  }

  async function serverAssetSignature(pathname, signal) {
    throwIfAborted(signal);
    const signatureKey = IMAGINEDECK_ASSET_SIGNATURE_KEYS.get(pathname);
    if (!signatureKey) {
      throw new Error(`No ImagineDeck signature key for ${pathname}`);
    }

    const request = stableImagineDeckRequest(pathname);
    try {
      const headResponse = await fetch(
        new Request(request.url, {
          method: 'HEAD',
          credentials: 'same-origin',
          signal
        }),
        { cache: 'reload', signal }
      );
      if (headResponse?.status === 200) {
        const validator = responseValidator(headResponse);
        if (validator) {
          return `${signatureKey}|${validator}`;
        }
      }
    } catch (error) {
      throwIfAborted(signal);
    }

    const response = await fetch(request, { cache: 'reload', signal });
    if (!response || response.status !== 200) {
      throw new Error(
        `ImagineDeck signature fetch for ${pathname} returned ` +
        `${response?.status ?? 'no response'}`
      );
    }
    return imagineDeckResponseSignature(pathname, response.clone());
  }

  async function readServerGenerationSignature(signal) {
    const signatures = await Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(pathname =>
        serverAssetSignature(pathname, signal)
      )
    );
    return signatures.join('\n');
  }

  async function fetchGenerationEntriesFromNetwork(signal) {
    return Promise.all(
      [...ATOMIC_IMAGINEDECK_ASSET_PATHS].map(async pathname => {
        throwIfAborted(signal);
        const request = stableImagineDeckRequest(pathname);
        const response = await fetch(request, { cache: 'reload', signal });
        if (!response || response.status !== 200) {
          throw new Error(
            `ImagineDeck generation fetch for ${pathname} returned ` +
            `${response?.status ?? 'no response'}`
          );
        }
        return { request, response };
      })
    );
  }

  async function refreshStableGenerationWithinBudget() {
    if (boundedStableRefreshPromise) {
      return boundedStableRefreshPromise;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(
        new Error(
          `ImagineDeck stable-generation refresh exceeded ${REFRESH_BUDGET_MS} ms`
        )
      ),
      REFRESH_BUDGET_MS
    );

    boundedStableRefreshPromise = (async () => {
      let lastMismatch = null;
      for (let attempt = 1; attempt <= MAX_STABLE_FETCH_ATTEMPTS; attempt += 1) {
        throwIfAborted(controller.signal);
        const beforeSignature = await readServerGenerationSignature(controller.signal);
        const entries = await fetchGenerationEntriesFromNetwork(controller.signal);
        const fetchedSignature = await imagineDeckGenerationSignature(entries);
        const afterSignature = await readServerGenerationSignature(controller.signal);

        if (
          beforeSignature === fetchedSignature &&
          fetchedSignature === afterSignature
        ) {
          return publishImmutableGeneration(
            entries,
            fetchedSignature,
            controller.signal
          );
        }

        lastMismatch = {
          attempt,
          beforeSignature,
          fetchedSignature,
          afterSignature
        };
        console.warn(
          '[ServiceWorker] ImagineDeck release changed while staging; retrying within the bounded refresh budget.',
          lastMismatch
        );
      }

      throw new Error(
        'Unable to observe one stable ImagineDeck release within the bounded refresh budget: ' +
        JSON.stringify(lastMismatch)
      );
    })().finally(() => {
      clearTimeout(timeoutId);
      boundedStableRefreshPromise = null;
    });

    return boundedStableRefreshPromise;
  }

  async function responseFromGeneration(generation, request) {
    const cache = await caches.open(generation.cacheName);
    return cache.match(stableImagineDeckRequest(request.url || request));
  }

  async function pinGenerationForClient(generation, clientId) {
    if (!clientId) {
      throw new Error('ImagineDeck navigation client id is missing.');
    }

    const sourceEntries = generation.entries ||
      await readGenerationEntries(generation.cacheName);
    if (!sourceEntries) {
      throw new Error('Active immutable ImagineDeck generation is incomplete.');
    }

    const metadataCache = await caches.open(IMAGINEDECK_PIN_METADATA_CACHE_NAME);
    const metadataRequest = imagineDeckPinMetadataRequest(clientId);
    const previousPinResponse = await metadataCache.match(metadataRequest);
    let previousCacheName = null;
    if (previousPinResponse) {
      try {
        const previousPin = await previousPinResponse.json();
        previousCacheName =
          typeof previousPin.cacheName === 'string'
            ? previousPin.cacheName
            : null;
      } catch (error) {
        previousCacheName = null;
      }
    }

    const cacheName =
      `${IMAGINEDECK_PIN_CACHE_PREFIX}client-v${STORAGE_GENERATION_VERSION}-` +
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pinnedCache = await caches.open(cacheName);

    try {
      for (const entry of sourceEntries) {
        await pinnedCache.put(entry.request, entry.response.clone());
      }
      const pinnedEntries = await Promise.all(
        sourceEntries.map(async entry => {
          const response = await pinnedCache.match(entry.request);
          return response ? { request: entry.request, response } : null;
        })
      );
      if (!pinnedEntries.every(Boolean)) {
        throw new Error('Pinned ImagineDeck client generation is incomplete.');
      }
      const pinnedSignature = await imagineDeckGenerationSignature(pinnedEntries);
      if (pinnedSignature !== generation.signature) {
        throw new Error('Pinned ImagineDeck client generation signature changed.');
      }

      await metadataCache.put(
        metadataRequest,
        new Response(
          JSON.stringify({
            cacheName,
            signature: generation.signature,
            createdAt: Date.now()
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }

    if (previousCacheName && previousCacheName !== cacheName) {
      await caches.delete(previousCacheName);
    }
    return { cacheName, signature: generation.signature };
  }

  async function handleGenerationDocumentNavigation(request, evt) {
    if (evt?.waitUntil) {
      evt.waitUntil(cleanupExpiredImagineDeckPins().catch(() => {}));
    }

    let generation = null;
    try {
      generation = await refreshStableGenerationWithinBudget();
    } catch (error) {
      console.warn(
        '[ServiceWorker] Bounded ImagineDeck generation refresh failed; retaining a verified existing generation when available.',
        error
      );
      generation = await readActiveGenerationPointer();
    }

    if (!generation) {
      return retryingNavigationUnavailable(
        'ImagineDeck is preparing a coherent asset generation. Retrying shortly.'
      );
    }

    const clientId = evt?.resultingClientId || evt?.clientId || '';
    if (!clientId) {
      return retryingNavigationUnavailable(
        'Unable to identify the ImagineDeck navigation client. Retrying shortly.'
      );
    }

    try {
      const pinned = await pinGenerationForClient(generation, clientId);
      const pinnedCache = await caches.open(pinned.cacheName);
      const documentResponse = await pinnedCache.match(
        stableImagineDeckRequest(request.url)
      );
      if (!documentResponse) {
        throw new Error('Pinned ImagineDeck document response is missing.');
      }
      return attachImagineDeckGenerationSignature(
        documentResponse,
        pinned.signature
      );
    } catch (error) {
      console.warn(
        '[ServiceWorker] Failed to pin the bounded ImagineDeck generation.',
        error
      );
      return retryingNavigationUnavailable(
        'Unable to pin a coherent ImagineDeck generation. Retrying shortly.'
      );
    }
  }

  async function handlePromotionRequest(request) {
    let generation = null;
    try {
      generation = await refreshStableGenerationWithinBudget();
    } catch (error) {
      console.warn(
        '[ServiceWorker] Bounded ImagineDeck promotion failed; retaining the verified active generation.',
        error
      );
      generation = await readActiveGenerationPointer();
    }

    if (!generation) {
      return serviceUnavailable(
        `No coherent ImagineDeck generation for ${request.url}`
      );
    }
    return (
      await responseFromGeneration(generation, request)
    ) || serviceUnavailable(
      `ImagineDeck generation response is missing for ${request.url}`
    );
  }

  handleNetworkFirstAssetRequest = function handleNetworkFirstAssetRequestV43(
    request,
    evt
  ) {
    const requestUrl = new URL(request.url);
    const isAtomic =
      requestUrl.origin === self.location.origin &&
      ATOMIC_IMAGINEDECK_ASSET_PATHS.has(requestUrl.pathname);
    if (!isAtomic) {
      return baseHandleNetworkFirstAssetRequest(request, evt);
    }

    const requireNetwork =
      request.headers.get(IMAGINEDECK_REQUIRE_NETWORK_HEADER) === '1';
    const stageOnly =
      request.headers.get(IMAGINEDECK_STAGE_ONLY_HEADER) === '1';
    const isGenerationNavigation =
      requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
      request.mode === 'navigate';
    const isPromotion =
      request.headers.get(IMAGINEDECK_PROMOTE_ATOMIC_HEADER) === '1' ||
      (
        requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
        request.mode !== 'navigate'
      );

    if (isGenerationNavigation) {
      return handleGenerationDocumentNavigation(request, evt);
    }
    if (!requireNetwork && !stageOnly && isPromotion) {
      return handlePromotionRequest(request);
    }
    return baseHandleNetworkFirstAssetRequest(request, evt);
  };

  self.__IMAGINEDECK_SW_ORCHESTRATOR_VERSION__ = ORCHESTRATOR_VERSION;
})();
