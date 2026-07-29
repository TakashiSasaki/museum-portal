// --- Service Worker loader for Museum Portal ---
// Keep the stable portal strategies in the core and apply focused ImagineDeck
// navigation hardening after the core has registered its event handlers.
importScripts('/sw-core.js');
importScripts('/sw-imaginedeck-navigation-v35.js');
