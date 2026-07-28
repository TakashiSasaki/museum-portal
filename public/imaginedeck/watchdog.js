(() => {
    'use strict';

    const WATCHDOG_VERSION = 2;
    const CHECK_INTERVAL_MS = 60_000;
    const HEARTBEAT_TIMEOUT_MS = 150_000;
    const CHILD_STATE_CONFIRM_TIMEOUT_MS = 2_000;
    const RELOAD_WINDOW_MS = 10 * 60_000;
    const MAX_RELOADS_PER_WINDOW = 3;
    const APP_URL = './app.html';
    const ASSET_SIGNATURE_STORAGE_KEY = 'imaginedeck-loaded-asset-signature';
    const MONITORED_ASSET_URLS = [
        './app.html',
        './index.js',
        './index.css',
        './mergeFeeds.js',
        './heartbeat.js',
        './QR_458893.png'
    ];

    const frame = document.getElementById('imaginedeck-frame');
    if (!frame) {
        console.error('[ImagineDeck Watchdog] iframe not found.');
        return;
    }

    let lastHealthyHeartbeatAt = Date.now();
    let lastCheckAt = Date.now();
    let reloadHistory = [];
    let reloadSuppressed = false;
    let reloadInProgress = false;
    let childStateKnown = false;
    let childBusy = false;
    let loadedAssetSignature = sessionStorage.getItem(ASSET_SIGNATURE_STORAGE_KEY);
    let pendingAssetSignature = null;
    let updateCheckInProgress = false;
    const childStateWaiters = new Set();

    function pruneReloadHistory(now) {
        reloadHistory = reloadHistory.filter(
            timestamp => now - timestamp < RELOAD_WINDOW_MS
        );
    }

    function requestImmediateHeartbeat(reason) {
        frame.contentWindow?.postMessage(
            {
                type: 'imaginedeck-heartbeat-request',
                timestamp: Date.now(),
                reason
            },
            window.location.origin
        );
    }

    function resolveChildStateWaiters(received) {
        for (const resolve of childStateWaiters) {
            resolve(received);
        }
        childStateWaiters.clear();
    }

    function requestFreshChildState(reason) {
        return new Promise(resolve => {
            let settled = false;

            const finish = received => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);
                childStateWaiters.delete(finish);
                resolve(received);
            };

            const timeoutId = setTimeout(
                () => finish(false),
                CHILD_STATE_CONFIRM_TIMEOUT_MS
            );

            childStateWaiters.add(finish);
            requestImmediateHeartbeat(reason);
        });
    }

    function grantHeartbeatGrace(reason) {
        const now = Date.now();
        lastHealthyHeartbeatAt = now;
        lastCheckAt = now;
        requestImmediateHeartbeat(reason);
        console.info('[ImagineDeck Watchdog] Heartbeat grace period granted.', { reason });
    }

    async function refreshServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return;
        }

        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) {
                return;
            }

            await registration.update();

            const candidate = registration.installing || registration.waiting;
            if (!candidate || candidate.state === 'activated') {
                return;
            }

            await new Promise(resolve => {
                const timeoutId = setTimeout(resolve, 10_000);
                candidate.addEventListener('statechange', () => {
                    if (candidate.state === 'activated' || candidate.state === 'redundant') {
                        clearTimeout(timeoutId);
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.warn('[ImagineDeck Watchdog] Service Worker update check failed.', error);
        }
    }

    async function evictMonitoredAssetCaches() {
        if (!('caches' in window)) {
            return;
        }

        try {
            const cacheNames = await caches.keys();
            const cacheEvictionUrls = MONITORED_ASSET_URLS.filter(
                assetUrl => assetUrl !== APP_URL
            );
            const assetRequests = cacheEvictionUrls.map(
                assetUrl => new Request(new URL(assetUrl, window.location.href).href)
            );

            await Promise.all(cacheNames.map(async cacheName => {
                const cache = await caches.open(cacheName);
                await Promise.all(assetRequests.map(
                    request => cache.delete(request, { ignoreSearch: true })
                ));
            }));
        } catch (error) {
            console.warn('[ImagineDeck Watchdog] Failed to evict monitored asset caches.', error);
        }
    }

    async function reloadFrame(reason, options = {}) {
        if (reloadInProgress) {
            return false;
        }

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
            return false;
        }

        reloadInProgress = true;

        try {
            if (options.refreshAssets === true) {
                await refreshServiceWorker();
                await evictMonitoredAssetCaches();
            }

            if (options.requireIdle === true) {
                const stateConfirmed = await requestFreshChildState(
                    'confirm idle state before applying content update'
                );

                if (!stateConfirmed || !childStateKnown || childBusy) {
                    console.info(
                        '[ImagineDeck Watchdog] Content update reload deferred after final state check.',
                        {
                            stateConfirmed,
                            childStateKnown,
                            childBusy
                        }
                    );
                    return false;
                }
            }

            const commitTime = Date.now();
            pruneReloadHistory(commitTime);
            if (reloadHistory.length >= MAX_RELOADS_PER_WINDOW) {
                reloadSuppressed = true;
                return false;
            }

            reloadHistory.push(commitTime);
            lastHealthyHeartbeatAt = commitTime;
            childStateKnown = false;
            childBusy = false;

            if (options.assetSignature) {
                loadedAssetSignature = options.assetSignature;
                sessionStorage.setItem(
                    ASSET_SIGNATURE_STORAGE_KEY,
                    options.assetSignature
                );
                pendingAssetSignature = null;
            }

            const stableAppUrl = new URL(APP_URL, window.location.href).href;

            console.warn('[ImagineDeck Watchdog] Reloading iframe.', { reason });
            frame.src = stableAppUrl;
            return true;
        } finally {
            reloadInProgress = false;
        }
    }

    async function applyPendingUpdateIfSafe() {
        if (
            !pendingAssetSignature ||
            reloadInProgress ||
            !childStateKnown ||
            childBusy
        ) {
            return;
        }

        const signatureToLoad = pendingAssetSignature;
        await reloadFrame('server content update detected', {
            refreshAssets: true,
            requireIdle: true,
            assetSignature: signatureToLoad
        });
    }

    function assetValidatorFromResponse(assetUrl, response) {
        const etag = response.headers.get('etag');
        if (etag) {
            return `${assetUrl}|etag:${etag}`;
        }

        const lastModified = response.headers.get('last-modified');
        if (lastModified) {
            const contentLength = response.headers.get('content-length') || '';
            return `${assetUrl}|last-modified:${lastModified}|length:${contentLength}`;
        }

        return null;
    }

    async function sha256Hex(arrayBuffer) {
        const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
        return Array.from(new Uint8Array(digest), byte =>
            byte.toString(16).padStart(2, '0')
        ).join('');
    }

    async function fetchAssetContentHash(assetUrl, url) {
        const response = await fetch(url.href, {
            method: 'GET',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`GET ${url.pathname} returned ${response.status}`);
        }

        const hash = await sha256Hex(await response.arrayBuffer());
        return `${assetUrl}|sha256:${hash}`;
    }

    async function fetchAssetValidator(assetUrl) {
        const url = new URL(assetUrl, window.location.href);

        try {
            const response = await fetch(url.href, {
                method: 'HEAD',
                cache: 'no-store'
            });

            if (response.ok) {
                const validator = assetValidatorFromResponse(assetUrl, response);
                if (validator) {
                    return validator;
                }
            }
        } catch (error) {
            console.warn(
                `[ImagineDeck Watchdog] HEAD update check failed for ${url.pathname}; falling back to content hash.`,
                error
            );
        }

        return fetchAssetContentHash(assetUrl, url);
    }

    async function readServerAssetSignature() {
        const validators = await Promise.all(
            MONITORED_ASSET_URLS.map(fetchAssetValidator)
        );
        return validators.join('\n');
    }

    async function checkForContentUpdate() {
        if (updateCheckInProgress) {
            return;
        }

        updateCheckInProgress = true;
        try {
            const currentSignature = await readServerAssetSignature();

            if (loadedAssetSignature === null) {
                pendingAssetSignature = currentSignature;
                console.info(
                    '[ImagineDeck Watchdog] Initial server asset signature recorded; synchronizing iframe assets.',
                    { deferred: !childStateKnown || childBusy }
                );
                await applyPendingUpdateIfSafe();
                return;
            }

            if (currentSignature === loadedAssetSignature) {
                pendingAssetSignature = null;
                return;
            }

            pendingAssetSignature = currentSignature;
            console.info('[ImagineDeck Watchdog] Server content update detected.', {
                deferred: !childStateKnown || childBusy
            });
            await applyPendingUpdateIfSafe();
        } catch (error) {
            console.warn('[ImagineDeck Watchdog] Server content update check failed.', error);
        } finally {
            updateCheckInProgress = false;
        }
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
        childStateKnown = true;
        childBusy = Boolean(message.stopwatchRunning) || Boolean(message.timerRunning);
        resolveChildStateWaiters(true);

        if (reloadSuppressed) {
            reloadSuppressed = false;
            reloadHistory = [];
            console.info('[ImagineDeck Watchdog] Healthy heartbeat restored.');
        }

        void applyPendingUpdateIfSafe();
    });

    frame.addEventListener('load', () => {
        // Allow a complete heartbeat timeout after every iframe navigation.
        grantHeartbeatGrace('iframe loaded');
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            grantHeartbeatGrace('page became visible');
        }
    });

    window.addEventListener('pageshow', () => {
        grantHeartbeatGrace('page shown');
    });

    setInterval(() => {
        const now = Date.now();
        const checkGapMs = now - lastCheckAt;
        lastCheckAt = now;

        if (document.visibilityState !== 'visible') {
            return;
        }

        if (checkGapMs > HEARTBEAT_TIMEOUT_MS) {
            grantHeartbeatGrace(`watchdog resumed after ${checkGapMs} ms`);
            return;
        }

        const silenceMs = now - lastHealthyHeartbeatAt;
        if (silenceMs > HEARTBEAT_TIMEOUT_MS) {
            void reloadFrame(`healthy heartbeat missing for ${silenceMs} ms`);
        }
    }, CHECK_INTERVAL_MS);

    // This marker certifies that the complete v2 watchdog script initialized.
    window.__IMAGINEDECK_WATCHDOG_VERSION__ = WATCHDOG_VERSION;

    void checkForContentUpdate();
    setInterval(() => {
        void checkForContentUpdate();
    }, CHECK_INTERVAL_MS);
})();
