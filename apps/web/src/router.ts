import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useSessionStore } from './stores/session.js';
import { useFlagsStore } from './stores/flags.js';
// Only the sign-in screen ships in the entry chunk; every other view loads on navigation.
import LoginView from './views/LoginView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: () => import('./views/RegisterView.vue') },
  { path: '/verify', name: 'verify', component: () => import('./views/VerifyView.vue') },
  { path: '/forgot', name: 'forgot', component: () => import('./views/ForgotView.vue') },
  { path: '/reset', name: 'reset', component: () => import('./views/ResetView.vue') },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./views/SettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings/capture',
    name: 'settings-capture',
    component: () => import('./views/CaptureView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings/connectors',
    name: 'settings-connectors',
    component: () => import('./views/ConnectorsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/today',
    name: 'today',
    component: () => import('./views/TodayView.vue'),
    meta: { requiresAuth: true, panelsTodayRequired: true },
  },
  {
    path: '/settings/connections',
    name: 'settings-connections',
    component: () => import('./views/ConnectionsView.vue'),
    meta: { requiresAuth: true, panelsTodayRequired: true },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('./views/MonthView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/add',
    name: 'add',
    component: () => import('./views/AddView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/year',
    name: 'year',
    component: () => import('./views/YearView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/import',
    name: 'import',
    component: () => import('./views/ImportView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/bin',
    name: 'bin',
    component: () => import('./views/BinView.vue'),
    meta: { requiresAuth: true },
  },
  {
    // C14: root-mounted API keeps `GET /categories`; the client route moves under /settings so a
    // hard refresh here never collides with the API route ahead of the SPA fallback.
    path: '/settings/categories',
    name: 'categories',
    component: () => import('./views/CategoriesView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings/categories/:id',
    name: 'category',
    component: () => import('./views/CategoryView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('./views/OnboardingView.vue'),
    meta: { requiresAuth: true },
  },
];

// Dev/preview only (research R5): the literal comparison lets Vite drop the branch and the chunk.
if (import.meta.env.VITE_UI_CATALOGUE === 'true') {
  routes.push({
    path: '/__ui',
    name: 'ui-catalogue',
    component: () => import('./catalogue/CatalogueView.vue'),
  });
  // T027 mock-ups (FR-004); same dev/preview-only branch, so production ships none of them.
  routes.push(
    {
      path: '/__ui/mockups/month-view',
      component: () => import('./catalogue/mockups/MonthViewMock.vue'),
    },
    {
      path: '/__ui/mockups/add-expense',
      component: () => import('./catalogue/mockups/AddExpenseMock.vue'),
    },
    {
      path: '/__ui/mockups/settings',
      component: () => import('./catalogue/mockups/SettingsMock.vue'),
    },
    {
      path: '/__ui/mockups/today',
      component: () => import('./catalogue/mockups/TodayMock.vue'),
    },
    {
      path: '/__ui/mockups/widgets',
      component: () => import('./catalogue/mockups/WidgetsMock.vue'),
    },
  );
}

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

let sessionLoaded = false;
let flagsLoaded = false;

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;

  const session = useSessionStore();
  if (!sessionLoaded && session.user === null) {
    sessionLoaded = true;
    await session.load();
  }
  if (!session.user) return { name: 'login', query: { redirect: to.fullPath } };

  // Load flags once after auth, required for panelsTodayRequired routes
  if (!flagsLoaded) {
    flagsLoaded = true;
    const flags = useFlagsStore();
    await flags.load();
  }

  // Check if route requires panels.today flag
  if (to.meta.panelsTodayRequired) {
    const flags = useFlagsStore();
    if (!flags.isOn('panels.today')) {
      return { name: 'home' };
    }
  }

  if (!session.user.onboardingCompletedAt && to.name !== 'onboarding') {
    return { name: 'onboarding' };
  }
  return true;
});
