import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { WidgetT } from '@desk/contracts';

vi.mock('../api/widgets.js', () => ({ getWidgets: vi.fn() }));
vi.mock('../api/client.js', () => ({
  apiFetch: vi.fn(async () => ({ sessions: [], currencies: [] })),
  ApiError: class extends Error {},
}));

const place = (name: string, lat: number) => ({
  name,
  admin1: null,
  country: 'UK',
  lat,
  lon: 0,
  timeZone: 'Europe/London',
});
const widget = (id: string, kind: string, p?: ReturnType<typeof place>) =>
  ({
    id,
    kind,
    position: 0,
    settings: {},
    state: 'ready',
    asOf: '2026-10-03T12:00:00Z',
    place: p,
  }) as WidgetT;

describe('SettingsView widgets section', () => {
  it('lists the places in use once and shows the unit preference', async () => {
    const api = await import('../api/widgets.js');
    const manchester = place('Manchester', 53.4);
    vi.mocked(api.getWidgets).mockResolvedValue({
      widgets: [
        widget('a', 'weather', manchester),
        widget('b', 'sunrise', manchester),
        widget('c', 'weather', place('Leeds', 53.8)),
        widget('d', 'currency'),
      ],
      limit: 8,
      temperatureUnit: 'F',
    });
    const { default: SettingsView } = await import('./SettingsView.vue');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: SettingsView }],
    });
    await router.push('/');
    const pinia = createPinia();
    setActivePinia(pinia);
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(SettingsView).use(pinia).use(router).mount(el);
    for (let i = 0; i < 6; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    const section = [...el.querySelectorAll('section')].find(
      (s) => s.querySelector('h2')?.textContent === 'Widgets',
    );
    expect(section).toBeDefined();
    const items = [...section!.querySelectorAll('[data-testid="widget-place"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(items).toEqual(['Manchester', 'Leeds']);
    expect(section!.querySelector<HTMLInputElement>('input[value="F"]')?.checked).toBe(true);
  });
});
