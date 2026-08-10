// ImagineDeck fullscreen shell extension.
// sw-core-v44.js is imported first and provides CORE_CACHE_NAME and
// fetchCoreAssetWithTimeout(). Keep this feature-specific asset outside the
// atomic ImagineDeck app generation while making it available for offline use.

const IMAGINEDECK_FULLSCREEN_SHELL_ASSETS = [
  '/imaginedeck/fullscreen-guard-v2.js'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE_NAME);

    for (const assetUrl of IMAGINEDECK_FULLSCREEN_SHELL_ASSETS) {
      const request = new Request(assetUrl);
      const response = await fetchCoreAssetWithTimeout(request);
      if (!response || response.status !== 200) {
        throw new Error(
          `ImagineDeck fullscreen shell asset failed to precache: ${assetUrl}`
        );
      }
      await cache.put(assetUrl, response);
    }
  })());
});
