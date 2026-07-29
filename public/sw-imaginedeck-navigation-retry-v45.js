(() => {
  'use strict';

  const IMAGINEDECK_NAVIGATION_RETRY_VERSION = 45;
  const RETRY_DELAY_SECONDS = 1;
  const baseHandleNetworkFirstAssetRequest = handleNetworkFirstAssetRequest;

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  async function retryingNavigationResponse(response) {
    let message = 'ImagineDeckの整合した資産世代を準備しています。';
    try {
      const responseText = await response.clone().text();
      if (responseText.trim()) {
        message = responseText.trim();
      }
    } catch (error) {
      // Keep the generic message when the original response body is unavailable.
    }

    const escapedMessage = escapeHtml(message);
    return new Response(
      '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
      `<meta http-equiv="refresh" content="${RETRY_DELAY_SECONDS}">` +
      '<meta name="robots" content="noindex">' +
      '<title>ImagineDeckを準備しています</title></head><body>' +
      `<p>${escapedMessage}</p>` +
      `<script>setTimeout(() => location.reload(), ${RETRY_DELAY_SECONDS * 1000});</script>` +
      '</body></html>',
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

  handleNetworkFirstAssetRequest = async function handleNetworkFirstAssetRequestV45(
    request,
    evt
  ) {
    const response = await baseHandleNetworkFirstAssetRequest(request, evt);
    const requestUrl = new URL(request.url);
    const isImagineDeckNavigation =
      requestUrl.origin === self.location.origin &&
      requestUrl.pathname === IMAGINEDECK_DOCUMENT_PATH &&
      request.mode === 'navigate';

    if (!isImagineDeckNavigation || response?.status !== 503) {
      return response;
    }

    return retryingNavigationResponse(response);
  };

  self.__IMAGINEDECK_SW_NAVIGATION_RETRY_VERSION__ =
    IMAGINEDECK_NAVIGATION_RETRY_VERSION;
})();
