(() => {
    'use strict';

    const CHECK_INTERVAL_MS = 60_000;
    const HEARTBEAT_TIMEOUT_MS = 150_000;
    const RELOAD_WINDOW_MS = 10 * 60_000;
    const MAX_RELOADS_PER_WINDOW = 3;
    const APP_URL = './app.html';

    const frame = document.getElementById('imaginedeck-frame');
    if (!frame) {
        console.error('[ImagineDeck Watchdog] iframe not found.');
        return;
    }

    let lastHealthyHeartbeatAt = Date.now();
    let reloadHistory = [];
    let reloadSuppressed = false;

    function pruneReloadHistory(now) {
        reloadHistory = reloadHistory.filter(
            timestamp => now - timestamp < RELOAD_WINDOW_MS
        );
    }

    function reloadFrame(reason) {
        const now = Date.now();
        pruneReloadHistory(now);

        if (reloadHistory.length >= MAX_RELOADS_PER_WINDOW) {
            if (!reloadSuppressed) {
                console.error(
                    '[ImagineDeck Watchdog] Automatic reload suppressed after repeated failures.',
                    { reason, reloadHistory: [...reloadHistory] }
                );
            }
            reloadSuppressed = true;
            return;
        }

        reloadHistory.push(now);
        lastHealthyHeartbeatAt = now;

        const url = new URL(APP_URL, window.location.href);
        url.searchParams.set('watchdogReload', String(now));

        console.warn('[ImagineDeck Watchdog] Reloading iframe.', { reason });
        frame.src = url.href;
    }

    window.addEventListener('message', event => {
        if (
            event.origin !== window.location.origin ||
            event.source !== frame.contentWindow
        ) {
            return;
        }

        const message = event.data;
        if (!message || message.type !== 'imaginedeck-heartbeat') {
            return;
        }

        if (message.appReady !== true) {
            console.warn('[ImagineDeck Watchdog] Unhealthy heartbeat received.', message);
            return;
        }

        lastHealthyHeartbeatAt = Date.now();

        if (reloadSuppressed) {
            reloadSuppressed = false;
            reloadHistory = [];
            console.info('[ImagineDeck Watchdog] Healthy heartbeat restored.');
        }
    });

    frame.addEventListener('load', () => {
        // Allow a complete heartbeat timeout after every iframe navigation.
        lastHealthyHeartbeatAt = Date.now();
    });

    setInterval(() => {
        const silenceMs = Date.now() - lastHealthyHeartbeatAt;
        if (silenceMs > HEARTBEAT_TIMEOUT_MS) {
            reloadFrame(`healthy heartbeat missing for ${silenceMs} ms`);
        }
    }, CHECK_INTERVAL_MS);
})();
