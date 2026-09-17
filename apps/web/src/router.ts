import { createRouter, createWebHistory } from 'vue-router';
import HelloView from './views/HelloView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: HelloView }],
});
