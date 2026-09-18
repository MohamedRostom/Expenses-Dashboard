import '@desk/ui/tokens.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import { initOfflineQueue } from './offline/queue.js';

createApp(App).use(createPinia()).use(router).mount('#app');
initOfflineQueue();
