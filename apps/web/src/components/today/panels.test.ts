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

  it('shows the no-accounts state when the payload has no accounts', async () => {
    const text = await render(panel, (s) => {
      s.payload = { days: [], messages: [], accounts: [], generatedAt: '2026-09-26T00:00:00Z' };
    });
    expect(text).toContain(noAccountsCopy);
  });
});
