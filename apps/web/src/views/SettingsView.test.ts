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

async function mountSettings(flags: Record<string, boolean>) {
  const api = await import('../api/widgets.js');
  vi.mocked(api.getWidgets).mockResolvedValue({ widgets: [], limit: 8, temperatureUnit: 'C' });
  const { default: SettingsView } = await import('./SettingsView.vue');
  const { useFlagsStore } = await import('../stores/flags.js');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: SettingsView }],
  });
  await router.push('/');
  const pinia = createPinia();
  setActivePinia(pinia);
  useFlagsStore().flags = flags;
  const el = document.createElement('div');
  document.body.appendChild(el);
  createApp(SettingsView).use(pinia).use(router).mount(el);
  for (let i = 0; i < 6; i++) await nextTick();
  return el;
}

describe('SettingsView appearance section (spec 006 US1)', () => {
  it('shows Appearance with the motion picker only when appearance.motion is on', async () => {
    const on = await mountSettings({ 'appearance.motion': true });
    const section = on.querySelector('#st-appearance');
    expect(section?.querySelector('h3')?.textContent).toBe('Appearance');
    expect(
      section?.querySelector('[role="radiogroup"][aria-label="Background motion"]'),
    ).not.toBeNull();
    expect(on.querySelector('a[href="#st-appearance"]')).not.toBeNull();

    const off = await mountSettings({});
    expect(off.querySelector('#st-appearance')).toBeNull();
    expect(off.querySelector('a[href="#st-appearance"]')).toBeNull();
  }, 20_000);

  it('lays the sections out on the shared .board-grid instead of its own columns', async () => {
    const el = await mountSettings({});
    expect(el.querySelector('.desk-settings-sections')!.classList.contains('board-grid')).toBe(
      true,
    );
  });
});

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
      (s) => s.querySelector('h3')?.textContent === 'Widgets',
    );
    expect(el.querySelectorAll('main')).toHaveLength(1);
    expect(section).toBeDefined();
    const items = [...section!.querySelectorAll('[data-testid="widget-place"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(items).toEqual(['Manchester', 'Leeds']);
    expect(section!.querySelector<HTMLInputElement>('input[value="F"]')?.checked).toBe(true);
  });
});
