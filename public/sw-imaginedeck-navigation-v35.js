(() => {
  'use strict';

  const IMAGINEDECK_NAVIGATION_VERSION = 35;
  const baseHandleNetworkFirstAssetRequest = handleNetworkFirstAssetRequest;

  function coherentGenerationUnavailable(message) {
    return new Response(message, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  async function handleImagineDeckNavigationV35(request, evt) {
    const stableRequest = stableImagineDeckRequest(request.url);
    const cache = await caches.open(IMAGINEDECK_ASSET_CACHE_NAME);
    let activeDocumentResponse = await cache.match(stableRequest);

    if (evt?.waitUntil) {
      evt.waitUntil(cleanupExpiredImagineDeckPins().catch(() => {}));
    }

    try {
      // app.html navigation is the generation boundary. Refresh all six assets
      // before snapshotting so online direct and scheduled reloads select the
      // latest complete generation rather than a previously active generation.
      await refreshAtomicAssetSetFromNetwork();
      activeDocumentResponse = await cache.match(stableRequest);
    } catch (error) {
      console.warn(
        '[ServiceWorker] Failed to refresh the latest ImagineDeck generation before navigation; using the existing coherent generation.',
        error
      );
    }

    if (!activeDocumentResponse) {
      return coherentGenerationUnavailable(
        `No coherent ImagineDeck generation for ${request.url}`
      );
    }

    const navigationClientId = evt?.resultingClientId || evt?.clientId || '';
    if (!navigationClientId) {
      console.error(
        '[ServiceWorker] Cannot pin the ImagineDeck navigation without a client id.'
      );
      return coherentGenerationUnavailable(
        'Unable to pin a coherent ImagineDeck generation.'
      );
    }

    try {
      const pinnedGeneration = await pinActiveImagineDeckGeneration(
        navigationClientId
      );
      if (!pinnedGeneration) {
        throw new Error('Pinned ImagineDeck generation metadata is missing.');
      }

      const pinnedCache = await caches.open(pinnedGeneration.cacheName);
      const pinnedDocumentResponse = await pinnedCache.match(stableRequest);
      if (!pinnedDocumentResponse) {
        throw new Error('Pinned ImagineDeck document response is missing.');
      }

      return attachImagineDeckGenerationSignature(
        pinnedDocumentResponse,
        pinnedGeneration.signature
      );
    } catch (error) {
      console.warn(
        '[ServiceWorker] Failed to pin the ImagineDeck generation for this navigation.',
        error
      );
      // Never serve an unpinned document: its later subresource requests could
      // otherwise resolve from a different active generation.
      return coherentGenerationUnavailable(
        'Unable to pin a coherent ImagineDeck generation.'
      );
    }
  }

  handleNetworkFirstAssetRequest = function handleNetworkFirstAssetRequestV35(
    request,
    evt
  ) {
    const requestUrl = new URL(request.url);
    const isGenerationDocument =
      requestUrl.origin === self.location.origin &&
      requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
      request.mode === 'navigate';

    if (!isGenerationDocument) {
      return baseHandleNetworkFirstAssetRequest(request, evt);
    }

    return handleImagineDeckNavigationV35(request, evt);
  };

  self.__IMAGINEDECK_SW_NAVIGATION_VERSION__ =
    IMAGINEDECK_NAVIGATION_VERSION;
})();
