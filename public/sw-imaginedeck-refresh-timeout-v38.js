(() => {
  'use strict';

  const REFRESH_TIMEOUT_PATCH_VERSION = 38;
  const ATOMIC_NETWORK_REQUEST_TIMEOUT_MS = 4_000;
  const ATOMIC_HANDLER_TIMEOUT_MS = 12_000;
  const PIN_FALLBACK_TIMEOUT_MS = 2_000;
  const V36_POINTER_CACHE_NAME =
    `${IMAGINEDECK_PIN_CACHE_PREFIX}generation-pointer-v36`;
  const V36_POINTER_REQUEST = new Request(
    new URL('/__imaginedeck-active-generation-v36__', self.location.origin).href
  );
  const V36_GENERATION_CACHE_PREFIX =
    `${IMAGINEDECK_PIN_CACHE_PREFIX}generation-v36-`;
  const baseFetch = self.fetch.bind(self);
  const baseHandleNetworkFirstAssetRequest = handleNetworkFirstAssetRequest;

  function serviceUnavailable(message) {
    return new Response(message, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs} ms`)),
        timeoutMs
      );

      Promise.resolve(promise).then(
        value => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        error => {
          clearTimeout(timeoutId);
          reject(error);
        }
      );
    });
  }

  function atomicRequestInfo(input) {
    try {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      return {
        request,
        url,
        isAtomic:
          url.origin === self.location.origin &&
          ATOMIC_IMAGINEDECK_ASSET_PATHS.has(url.pathname)
      };
    } catch (error) {
      return { request: null, url: null, isAtomic: false };
    }
  }

  function composeAbortSignal(timeoutMs, inheritedSignal) {
    const controller = new AbortController();
    let inheritedAbortHandler = null;

    if (inheritedSignal) {
      if (inheritedSignal.aborted) {
        controller.abort(inheritedSignal.reason);
      } else {
        inheritedAbortHandler = () => controller.abort(inheritedSignal.reason);
        inheritedSignal.addEventListener('abort', inheritedAbortHandler, { once: true });
      }
    }

    const timeoutId = setTimeout(
      () => controller.abort(
        new Error(
          `ImagineDeck network request timed out after ${timeoutMs} ms`
        )
      ),
      timeoutMs
    );

    return {
      signal: controller.signal,
      cleanup() {
        clearTimeout(timeoutId);
        if (inheritedSignal && inheritedAbortHandler) {
          inheritedSignal.removeEventListener('abort', inheritedAbortHandler);
        }
      }
    };
  }

  // Bound every network operation used by the v36 stable-generation reader.
  // Request.signal is always present, even when the caller did not explicitly
  // supply one, so it must be composed with—not treated as a substitute for—the
  // internal timeout signal.
  self.fetch = function fetchWithImagineDeckTimeout(input, init = undefined) {
    const { request, isAtomic } = atomicRequestInfo(input);
    if (!isAtomic) {
      return baseFetch(input, init);
    }

    const inheritedSignal = init?.signal || request?.signal || null;
    const composed = composeAbortSignal(
      ATOMIC_NETWORK_REQUEST_TIMEOUT_MS,
      inheritedSignal
    );

    return baseFetch(input, { ...(init || {}), signal: composed.signal })
      .finally(composed.cleanup);
  };

  async function readV36ActiveGenerationResponse(request) {
    const pointerCache = await caches.open(V36_POINTER_CACHE_NAME);
    const pointerResponse = await pointerCache.match(V36_POINTER_REQUEST);
    if (!pointerResponse) {
      return null;
    }

    let pointer;
    try {
      pointer = await pointerResponse.json();
    } catch (error) {
      return null;
    }

    if (
      typeof pointer?.cacheName !== 'string' ||
      !pointer.cacheName.startsWith(V36_GENERATION_CACHE_PREFIX) ||
      typeof pointer.signature !== 'string'
    ) {
      return null;
    }

    const generationCache = await caches.open(pointer.cacheName);
    const response = await generationCache.match(
      stableImagineDeckRequest(request.url || request)
    );
    return response ? { response, signature: pointer.signature } : null;
  }

  async function fallbackAfterRefreshTimeout(request, evt, error) {
    const requestUrl = new URL(request.url);
    const requireNetwork =
      request.headers.get(IMAGINEDECK_REQUIRE_NETWORK_HEADER) === '1';
    const stageOnly =
      request.headers.get(IMAGINEDECK_STAGE_ONLY_HEADER) === '1';
    const isContentHashProbe =
      request.method === 'GET' &&
      request.mode !== 'navigate' &&
      request.cache === 'no-store' &&
      !requireNetwork &&
      !stageOnly &&
      request.headers.get(IMAGINEDECK_PROMOTE_ATOMIC_HEADER) !== '1';

    console.warn(
      `[ServiceWorker] ImagineDeck generation handling timed out for ${requestUrl.pathname}; using a coherent cached generation when allowed.`,
      error
    );

    // Network-verification requests must never be certified from cached bytes.
    if (requireNetwork || stageOnly || isContentHashProbe) {
      return serviceUnavailable(
        `Network-only ImagineDeck request timed out for ${request.url}`
      );
    }

    const isNavigation =
      requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
      request.mode === 'navigate';

    if (isNavigation) {
      const clientId = evt?.resultingClientId || evt?.clientId || '';
      if (!clientId) {
        return serviceUnavailable(
          'Unable to pin a cached ImagineDeck generation after refresh timeout.'
        );
      }

      try {
        // With an existing pointer this path performs only Cache API work. If no
        // coherent pointer exists, the v36 helper may join the timed-out refresh;
        // bound that wait separately and fail closed.
        const pinned = await withTimeout(
          pinActiveImagineDeckGeneration(clientId),
          PIN_FALLBACK_TIMEOUT_MS,
          'ImagineDeck cached-generation pin'
        );
        const pinnedCache = await caches.open(pinned.cacheName);
        const documentResponse = await pinnedCache.match(
          stableImagineDeckRequest(request.url)
        );
        if (!documentResponse) {
          throw new Error('Pinned cached ImagineDeck document is missing.');
        }
        return attachImagineDeckGenerationSignature(
          documentResponse,
          pinned.signature
        );
      } catch (fallbackError) {
        console.warn(
          '[ServiceWorker] Cached ImagineDeck navigation fallback failed.',
          fallbackError
        );
        return serviceUnavailable(
          'No coherent cached ImagineDeck generation is available.'
        );
      }
    }

    const pinnedResponse = await matchPinnedImagineDeckResponse(
      evt?.clientId || '',
      stableImagineDeckRequest(request.url)
    );
    if (pinnedResponse) {
      return pinnedResponse;
    }

    const active = await readV36ActiveGenerationResponse(request);
    if (active?.response) {
      return active.response;
    }

    return serviceUnavailable(
      `No coherent cached ImagineDeck generation for ${request.url}`
    );
  }

  handleNetworkFirstAssetRequest = function handleNetworkFirstAssetRequestV38(
    request,
    evt
  ) {
    const { isAtomic } = atomicRequestInfo(request);
    if (!isAtomic) {
      return baseHandleNetworkFirstAssetRequest(request, evt);
    }

    return withTimeout(
      baseHandleNetworkFirstAssetRequest(request, evt),
      ATOMIC_HANDLER_TIMEOUT_MS,
      'ImagineDeck generation refresh and delivery'
    ).catch(error => fallbackAfterRefreshTimeout(request, evt, error));
  };

  self.__IMAGINEDECK_SW_REFRESH_TIMEOUT_VERSION__ =
    REFRESH_TIMEOUT_PATCH_VERSION;
})();
