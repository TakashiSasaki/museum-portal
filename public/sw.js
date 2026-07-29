// --- Service Worker loader for Museum Portal ---
// Every imported script URL is versioned because some portal entry points use
// the browser default updateViaCache policy for Service Worker imports.
importScripts('/sw-core-v34.js');
importScripts('/sw-imaginedeck-generation-v36.js');
importScripts('/sw-imaginedeck-network-v36.js');
importScripts('/sw-imaginedeck-refresh-timeout-v41.js');
