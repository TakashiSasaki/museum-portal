(() => {
    'use strict';

    const HEARTBEAT_INTERVAL_MS = 60_000;
    const REQUIRED_PARENT_WATCHDOG_VERSION = 2;
    const PARENT_RELOAD_RETRY_MS = 10 * 60_000;
    const PARENT_RELOAD_STORAGE_KEY = 'imaginedeck-parent-watchdog-reload-at';

    let previousClockValue = null;
    let queuedStateHeartbeat = false;

    function ensureParentWatchdogVersion() {
        if (window.parent === window) {
            return true;
        }

        try {
            if (
                window.parent.__IMAGINEDECK_WATCHDOG_VERSION__ ===
                REQUIRED_PARENT_WATCHDOG_VERSION
            ) {
                return true;
            }

            const now = Date.now();
            const previousReloadAt = Number(
                window.parent.sessionStorage.getItem(PARENT_RELOAD_STORAGE_KEY) || 0
            );

            if (now - previousReloadAt > PARENT_RELOAD_RETRY_MS) {
                window.parent.sessionStorage.setItem(
                    PARENT_RELOAD_STORAGE_KEY,
                    String(now)
                );
                window.parent.location.reload();
            }

            return false;
        } catch (error) {
            console.warn('[ImagineDeck Heartbeat] Parent watchdog version check failed.', error);
            return true;
        }
    }

    function readApplicationState(options = {}) {
        try {
            const clockParts = [
                document.getElementById('clock-date')?.textContent,
                document.getElementById('clock-h')?.textContent,
                document.getElementById('clock-m')?.textContent,
                document.getElementById('clock-s')?.textContent
            ];
            const clockValue = clockParts.join('|');
            const clockInitialized = Boolean(clockParts[0]);
            const clockProgressing =
                options.allowUnchangedClock === true ||
                previousClockValue === null ||
                clockValue !== previousClockValue;

            previousClockValue = clockValue;

            const stopwatchRunning =
                typeof isSwRunning === 'boolean' && isSwRunning;
            const timerRunning =
                typeof isTimerRunning === 'boolean' && isTimerRunning;

            const appReady =
                document.readyState === 'complete' &&
                typeof updateClock === 'function' &&
                typeof initFeeds === 'function' &&
                typeof nextNoticePage === 'function' &&
                typeof isSwRunning === 'boolean' &&
                typeof isTimerRunning === 'boolean' &&
                clockInitialized &&
                clockProgressing;

            return {
                appReady,
                stopwatchRunning,
                timerRunning
            };
        } catch (error) {
            return {
                appReady: false,
                stopwatchRunning: false,
                timerRunning: false,
                stateReadError: error instanceof Error ? error.message : String(error)
            };
        }
    }

    function sendHeartbeat(options = {}) {
        if (window.parent === window || !ensureParentWatchdogVersion()) {
            return;
        }

        window.parent.postMessage(
            {
                type: 'imaginedeck-heartbeat',
                timestamp: Date.now(),
                ...readApplicationState(options)
            },
            window.location.origin
        );
    }

    function queueStateHeartbeat() {
        if (queuedStateHeartbeat) {
            return;
        }

        queuedStateHeartbeat = true;
        queueMicrotask(() => {
            queuedStateHeartbeat = false;
            sendHeartbeat({ allowUnchangedClock: true });
        });
    }

    function observeRunStateChanges() {
        const runStateTargets = [
            document.querySelector('[data-target="mode-stopwatch"]'),
            document.querySelector('[data-target="mode-timer"]')
        ].filter(Boolean);

        if (runStateTargets.length === 0) {
            return;
        }

        const observer = new MutationObserver(queueStateHeartbeat);
        runStateTargets.forEach(target => {
            observer.observe(target, {
                attributes: true,
                attributeFilter: ['class']
            });
        });
    }

    window.addEventListener('message', event => {
        if (
            event.origin !== window.location.origin ||
            event.source !== window.parent ||
            event.data?.type !== 'imaginedeck-heartbeat-request'
        ) {
            return;
        }

        sendHeartbeat({ allowUnchangedClock: true });
    });

    window.addEventListener('load', () => {
        observeRunStateChanges();
        sendHeartbeat({ allowUnchangedClock: true });
    }, { once: true });

    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
})();
