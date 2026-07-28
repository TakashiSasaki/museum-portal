(() => {
    'use strict';

    const HEARTBEAT_INTERVAL_MS = 60_000;
    let previousClockValue = null;

    function readApplicationState() {
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
                previousClockValue === null || clockValue !== previousClockValue;

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

    window.addEventListener('load', sendHeartbeat, { once: true });
    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
})();
