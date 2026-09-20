import '@desk/ui/tokens.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import { initOfflineQueue } from './offline/queue.js';

createApp(App).use(createPinia()).use(router).mount('#app');
initOfflineQueue();

// Primes the __Host-desk_csrf cookie (apps/api/src/middleware/csrf.ts sets it on any GET) before
// the user's first mutating request. router.ts's guard only fires a GET (session.load(), which
// happens to go through the API) for requiresAuth routes — a browser landing directly on a
// public route (/login, /register, /forgot, /reset) never makes one first, so its first POST had
// no cookie to double-submit and 403'd. Fire-and-forget: never blocks boot, errors are silently
// ignored (offline/dev without the API running shouldn't break the app shell rendering).
fetch('/healthz').catch(() => {});
