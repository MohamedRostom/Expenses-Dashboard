import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const LINK_PATHS = [
  '/settings/categories',
  '/import',
  '/bin',
  '/settings/connectors',
  '/settings/capture',
];

let lastRouter: ReturnType<typeof createRouter>;

async function mountSettings(flags: Record<string, boolean>, hash = '') {
  const api = await import('../api/widgets.js');
  vi.mocked(api.getWidgets).mockResolvedValue({ widgets: [], limit: 8, temperatureUnit: 'C' });
  const { default: SettingsView } = await import('./SettingsView.vue');
  const { useFlagsStore } = await import('../stores/flags.js');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: SettingsView },
      { path: '/login', component: { template: '<p>login</p>' } },
      ...[...LINK_PATHS, '/settings/connections'].map((path) => ({
        path,
        component: { template: '<p />' },
      })),
    ],
  });
  await router.push('/' + hash);
  lastRouter = router;
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

    const off = await mountSettings({});
    expect(off.querySelector('#st-appearance')).toBeNull();
  }, 20_000);

  it('shows Appearance with only the colour controls when just appearance.accent is on', async () => {
    const el = await mountSettings({ 'appearance.accent': true });
    const section = el.querySelector('#st-appearance');
    expect(section?.querySelector('h3')?.textContent).toBe('Appearance');
    expect(el.querySelector('#st-appearance #appearance')).not.toBeNull();
    expect(section?.textContent).toContain('Accent colour');
    expect(section?.querySelector('[aria-label="Background motion"]')).toBeNull();
  }, 20_000);

  it('hides the colour controls when only appearance.motion is on', async () => {
    const el = await mountSettings({ 'appearance.motion': true });
    expect(el.querySelector('#st-appearance input[type="color"]')).toBeNull();
  });

  it('shows no Appearance section or anchor when neither flag is on', async () => {
    const el = await mountSettings({});
    expect(el.querySelector('#appearance')).toBeNull();
  });

  it('lays each group of sections out on the shared .board-grid instead of its own columns', async () => {
    const el = await mountSettings({});
    const grids = el.querySelectorAll('.desk-settings-group > .board-grid');
    expect(grids).toHaveLength(4);
  });

  it('puts the panels in one tabpanel per tab, in tab order', async () => {
    const el = await mountSettings({ 'appearance.motion': true });
    const tabs = [...el.querySelectorAll<HTMLElement>('[role="tab"]')];
    const groups = tabs.map((t) => [
      t.textContent?.trim(),
      [
        ...document
          .getElementById(t.getAttribute('aria-controls')!)!
          .querySelectorAll('.desk-settings-section'),
      ].map((p) => p.id),
    ]);
    expect(groups).toEqual([
      ['Account', ['st-profile', 'st-sessions']],
      ['Preferences', ['st-currency', 'st-timezone', 'st-widgets']],
      ['Look and feel', ['st-theme', 'st-appearance']],
      ['Your data', ['st-capture', 'st-export', 'st-delete']],
    ]);
  });
});

describe('SettingsView tabs', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  const tabs = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const visiblePanels = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter(
      (p) => p.style.display !== 'none',
    );

  it('is a tablist of four tabs with exactly one visible tabpanel, and no index nav', async () => {
    const el = await mountSettings({});
    expect(el.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Settings sections',
    );
    expect(el.querySelector('.desk-settings-index')).toBeNull();
    expect(tabs(el).map((t) => t.textContent?.trim())).toEqual([
      'Account',
      'Preferences',
      'Look and feel',
      'Your data',
    ]);
    expect(visiblePanels(el)).toHaveLength(1);
    expect(visiblePanels(el)[0]!.id).toBe('sg-account');
    expect(tabs(el).map((t) => [t.getAttribute('aria-selected'), t.tabIndex])).toEqual([
      ['true', 0],
      ['false', -1],
      ['false', -1],
      ['false', -1],
    ]);
    for (const t of tabs(el)) {
      expect(
        document.getElementById(t.getAttribute('aria-controls')!)?.getAttribute('aria-labelledby'),
      ).toBe(t.id);
    }
  });

  it('click selects, ArrowRight/ArrowLeft/End/Home move focus and selection, and the hash is replaced', async () => {
    const el = await mountSettings({});
    tabs(el)[1]!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(visiblePanels(el)[0]!.id).toBe('sg-preferences');
    expect(tabs(el)[1]!.getAttribute('aria-selected')).toBe('true');
    expect(lastRouter.currentRoute.value.hash).toBe('#sg-preferences');
    const key = async (k: string) => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true }),
      );
      await nextTick();
    };
    tabs(el)[1]!.focus();
    await key('ArrowRight');
    expect(visiblePanels(el)[0]!.id).toBe('sg-look');
    expect(document.activeElement).toBe(tabs(el)[2]);
    await key('End');
    expect(visiblePanels(el)[0]!.id).toBe('sg-data');
    await key('ArrowRight');
    expect(visiblePanels(el)[0]!.id).toBe('sg-account');
    await key('Home');
    await key('ArrowLeft');
    expect(visiblePanels(el)[0]!.id).toBe('sg-data');
  });

  it.each([
    ['#st-sessions', 'sg-account'],
    ['#sg-data', 'sg-data'],
    ['#st-currency', 'sg-preferences'],
    ['#st-delete', 'sg-data'],
  ])('opens on the tab for %s', async (hash, panel) => {
    const el = await mountSettings({});
    expect(visiblePanels(el)[0]!.id).toBe('sg-account');
    const el2 = await mountSettings({}, hash);
    expect(visiblePanels(el2)[0]!.id).toBe(panel);
  });

  it('selects the tab when the hash changes while open', async () => {
    const el = await mountSettings({});
    await lastRouter.push('/#sg-look');
    await nextTick();
    expect(visiblePanels(el)[0]!.id).toBe('sg-look');
  });

  it('#st-appearance falls back to Look and feel, without a scroll target, when the flag is off', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    const el = await mountSettings({}, '#st-appearance');
    expect(visiblePanels(el)[0]!.id).toBe('sg-look');
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the section scroll-padding and sticky index CSS gone and the width cap', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/SettingsView.vue', 'utf8');
    expect(css).not.toMatch(/desk-settings-index|12rem minmax/);
    expect(css).toContain('calc(1160px + 2 * var(--gutter-fluid))');
  });

  it('has no separate accent radiogroup in the Theme panel', async () => {
    const el = await mountSettings({ 'appearance.accent': true });
    expect(el.querySelector('.desk-settings-accents')).toBeNull();
    expect(el.querySelector('#st-theme')?.textContent).not.toContain('Accent colour');
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

describe('SettingsView Data and tools, hash and sign out (ADR-0008)', () => {
  const hrefs = (el: HTMLElement) =>
    [...el.querySelectorAll('[data-testid="data-tools"] a')].map((a) => a.getAttribute('href'));

  it('links every tool page with a description, Connections only with panels.today', async () => {
    const off = await mountSettings({});
    expect(hrefs(off)).toEqual(LINK_PATHS);
    const items = off.querySelectorAll('[data-testid="data-tools"] li');
    for (const li of items) expect(li.querySelector('p')?.textContent?.trim()).not.toBe('');

    const on = await mountSettings({ 'panels.today': true });
    expect(hrefs(on)).toContain('/settings/connections');
    expect(hrefs(on)).toHaveLength(LINK_PATHS.length + 1);
  });

  it('renders no h1, and shows Notion sync and Mail and calendar accounts under their new names', async () => {
    const el = await mountSettings({ 'panels.today': true });
    expect(el.querySelector('h1')).toBeNull();
    const labels = [...el.querySelectorAll('[data-testid="data-tools"] a')].map((a) =>
      a.textContent?.trim(),
    );
    expect(labels).toContain('Notion sync');
    expect(labels).toContain('Mail and calendar accounts');
    expect(labels).not.toContain('Connectors');
    expect(labels).not.toContain('Connections');
  });

  it('has a Feedback row that opens the panel, shown only below 1024px', async () => {
    const { useFeedback } = await import('../composables/useFeedback.js');
    const el = await mountSettings({});
    const row = el.querySelector<HTMLButtonElement>('[data-testid="feedback-settings"]')!;
    expect(row.textContent?.trim()).toBe('Feedback');
    row.click();
    expect(useFeedback().open.value).toBe(true);
    useFeedback().closeFeedback();
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/SettingsView.vue', 'utf8');
    expect(css).toMatch(
      /@media \(min-width: 1024px\)[^{]*\{[^}]*\.desk-settings-feedback[^}]*display:\s*none/s,
    );
  });

  it('keeps Sign out in the page but hides it from 1024px, where the sidebar carries it', async () => {
    const el = await mountSettings({});
    expect(el.querySelector('[data-testid="sign-out-settings"]')).not.toBeNull();
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/views/SettingsView.vue', 'utf8');
    expect(css).toMatch(
      /@media \(min-width: 1024px\)[^{]*\{[^}]*\.desk-settings-signout[^}]*display:\s*none/s,
    );
  });

  it('has an #appearance anchor inside the appearance panel when the flag is on', async () => {
    const el = await mountSettings({ 'appearance.motion': true });
    expect(el.querySelector('#st-appearance #appearance')).not.toBeNull();
  });

  it('scrolls to the appearance panel when opened with #appearance', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    await mountSettings({ 'appearance.motion': true }, '#appearance');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.contexts[0]).toHaveProperty('id', 'st-appearance');
  });

  it.each([
    ['succeeds', async () => ({ sessions: [], currencies: [] })],
    [
      'fails',
      async (path: string) => {
        if (path === '/auth/logout') throw new Error('offline');
        return { sessions: [], currencies: [] };
      },
    ],
  ])('Sign out leaves for /login when the API call %s', async (_n, impl) => {
    const client = await import('../api/client.js');
    vi.mocked(client.apiFetch).mockImplementation(impl as never);
    const el = await mountSettings({});
    el.querySelector<HTMLButtonElement>('[data-testid="sign-out-settings"]')!.click();
    for (let i = 0; i < 8; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(lastRouter.currentRoute.value.path).toBe('/login');
  });
});

describe('ADR-0008 shapes on settings and connection screens', () => {
  it.each([
    'src/views/SettingsView.vue',
    'src/views/CaptureView.vue',
    'src/views/ConnectorsView.vue',
    'src/views/ConnectionsView.vue',
    'src/components/connections/StandardsForm.vue',
    'src/components/appearance/AppearanceSettings.vue',
  ])('%s uses no ADR-0006 radius tokens', async (file) => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(file, 'utf8')).not.toMatch(/--radius-(sm|md|lg)\b/);
  });
});

describe('SettingsView sessions table spacing (finish review)', () => {
  it('gaps the Sessions title from its column heads', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/views/SettingsView.vue', 'utf8');
    expect(src).toMatch(
      /\.desk-settings-section :deep\(\.desk-data-table-wrap--board\) \{[^}]*padding-block-start: var\(--space-3\)/,
    );
  });
});
