(() => {
    'use strict';

    const HEARTBEAT_INTERVAL_MS = 60_000;
    let runtimeErrorDetected = false;

    function readApplicationState() {
        try {
            const clockDate = document.getElementById('clock-date');
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
                Boolean(clockDate && clockDate.textContent) &&
                !runtimeErrorDetected;

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

    function sendHeartbeat() {
        if (window.parent === window) {
            return;
        }

        window.parent.postMessage(
            {
                type: 'imaginedeck-heartbeat',
                timestamp: Date.now(),
                ...readApplicationState()
            },
            window.location.origin
        );
    }

    window.addEventListener('error', () => {
        runtimeErrorDetected = true;
        sendHeartbeat();
    });

    window.addEventListener('unhandledrejection', () => {
        runtimeErrorDetected = true;
        sendHeartbeat();
    });

    window.addEventListener('load', sendHeartbeat, { once: true });
    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
})();
