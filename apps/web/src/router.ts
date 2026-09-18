import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useSessionStore } from './stores/session.js';
import MonthView from './views/MonthView.vue';
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import VerifyView from './views/VerifyView.vue';
import ForgotView from './views/ForgotView.vue';
import ResetView from './views/ResetView.vue';
import SettingsView from './views/SettingsView.vue';
import YearView from './views/YearView.vue';
import ImportView from './views/ImportView.vue';
import BinView from './views/BinView.vue';
import OnboardingView from './views/OnboardingView.vue';
import CategoriesView from './views/CategoriesView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: RegisterView },
  { path: '/verify', name: 'verify', component: VerifyView },
  { path: '/forgot', name: 'forgot', component: ForgotView },
  { path: '/reset', name: 'reset', component: ResetView },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { requiresAuth: true } },
  { path: '/', name: 'home', component: MonthView, meta: { requiresAuth: true } },
  { path: '/year', name: 'year', component: YearView, meta: { requiresAuth: true } },
  { path: '/import', name: 'import', component: ImportView, meta: { requiresAuth: true } },
  { path: '/bin', name: 'bin', component: BinView, meta: { requiresAuth: true } },
  {
    path: '/categories',
    name: 'categories',
    component: CategoriesView,
    meta: { requiresAuth: true },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: OnboardingView,
    meta: { requiresAuth: true },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

let sessionLoaded = false;

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;
  const session = useSessionStore();
  if (!sessionLoaded && session.user === null) {
    sessionLoaded = true;
    await session.load();
  }
  if (!session.user) return { name: 'login' };
  return true;
});
