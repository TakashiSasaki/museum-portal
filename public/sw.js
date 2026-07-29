// --- Service Worker loader for Museum Portal ---
// Keep the stable portal strategies in the core and apply focused ImagineDeck
// immutable-generation handling after the core registers its event handlers.
importScripts('/sw-core.js');
importScripts('/sw-imaginedeck-generation-v36.js');
