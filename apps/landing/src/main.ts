import '@desk/ui/tokens.css';
import { ViteSSG } from 'vite-ssg';
import App from './App.vue';
import Index from './pages/index.vue';
import Privacy from './pages/privacy.vue';
import Terms from './pages/terms.vue';

export const createApp = ViteSSG(App, {
  routes: [
    { path: '/', component: Index },
    { path: '/privacy', component: Privacy },
    { path: '/terms', component: Terms },
  ],
});
