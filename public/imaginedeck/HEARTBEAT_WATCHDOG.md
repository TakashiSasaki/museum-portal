# Imagine Deck heartbeat watchdog

This stage adds runtime liveness monitoring between the outer page and the iframe application.

- The iframe application sends a heartbeat immediately after loading and every 60 seconds.
- A heartbeat is healthy only when the application globals are available and the clock display is progressing.
- The outer page checks every 60 seconds.
- If no healthy heartbeat has been received for more than 150 seconds, the iframe is reloaded with a cache-busting query parameter.
- Automatic recovery is limited to three reloads within ten minutes to avoid a visible reload loop.
- The existing hourly conditional reload in `index.js` remains active until server-content update monitoring replaces it in a later stage.

The iframe has a static `src`, so failure of `watchdog.js` does not prevent the existing application from being displayed. The heartbeat script loads after the existing application scripts, so failure of `heartbeat.js` does not prevent the existing application logic from starting.
