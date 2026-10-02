import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick, type Component } from 'vue';
import { describe, expect, it } from 'vitest';
import CalendarPanel from './CalendarPanel.vue';
import InboxPanel from './InboxPanel.vue';
import { useTodayStore } from '../../stores/today.js';

async function render(panel: Component, setup: (store: ReturnType<typeof useTodayStore>) => void) {
  const stub = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/settings/connections', name: 'settings-connections', component: stub },
    ],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  setup(useTodayStore());
  const el = document.createElement('div');
  createApp(panel).use(pinia).use(router).mount(el);
  await nextTick();
  return el.textContent ?? '';
}

async function mount(panel: Component, setup: (store: ReturnType<typeof useTodayStore>) => void) {
  const pinia = createPinia();
  setActivePinia(pinia);
  setup(useTodayStore());
  const el = document.createElement('div');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  createApp(panel).use(pinia).use(router).mount(el);
  await nextTick();
  return el;
}

describe.each([
  ['CalendarPanel', CalendarPanel, 'No calendar accounts connected'],
  ['InboxPanel', InboxPanel, 'No mail accounts connected'],
])('%s', (_name, panel, noAccountsCopy) => {
  // A failed GET /panels/today left payload null, which read as "no accounts connected".
  it('shows the error copy, not the no-accounts state, when the load failed', async () => {
    const text = await render(panel, (s) => {
      s.error = 'server_error';
    });
    expect(text).toContain('Something went wrong');
    expect(text).not.toContain(noAccountsCopy);
  });

  // T063: after the 30-day purge the cache is empty until the next refresh; show loading, not an
  // empty inbox or an empty week.
  it('shows the loading skeleton while an account is purged', async () => {
    const el = await mount(panel, (s) => {
      s.payload = {
        days: [],
        messages: [],
        accounts: [
          {
            id: 'a1',
            provider: 'google',
            label: 'Work',
            colour: 'teal',
            capabilities: ['mail', 'calendar'],
            status: 'connected',
            lastRefreshAt: null,
            lastError: null,
            stale: true,
            purged: true,
            unreadCount: 0,
          },
        ],
        generatedAt: '2026-09-26T00:00:00Z',
      };
    });
    expect(el.querySelectorAll('.desk-skeleton')).toHaveLength(1);
    expect(el.textContent).not.toContain('No messages in your inbox');
    expect(el.textContent).not.toContain('No events in the next seven days');
  });

  it('shows the no-accounts state when the payload has no accounts', async () => {
    const text = await render(panel, (s) => {
      s.payload = { days: [], messages: [], accounts: [], generatedAt: '2026-09-26T00:00:00Z' };
    });
    expect(text).toContain(noAccountsCopy);
  });
});
