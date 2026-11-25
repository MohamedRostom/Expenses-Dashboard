import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import appSource from './App.vue?raw';
import sidebarSource from './components/shell/AppSidebar.vue?raw';
import bottomBarSource from './components/shell/BottomBar.vue?raw';
import topBarSource from './components/shell/TopBar.vue?raw';
import navItemsSource from './components/shell/NavItems.vue?raw';
import feedbackSource from './components/FeedbackWidget.vue?raw';
import { useSessionStore } from './stores/session.js';

const stub = { template: '<div />' };
const shellSources = [appSource, sidebarSource, bottomBarSource, topBarSource, navItemsSource];

async function mount(
  path: string,
  signedIn: boolean,
  fetchImpl: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockResolvedValue(new Response('{}', { status: 200 })),
) {
  vi.stubGlobal('fetch', fetchImpl);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: stub },
      { path: '/', name: 'home', component: stub, meta: { requiresAuth: true } },
      { path: '/year', name: 'year', component: stub, meta: { requiresAuth: true } },
      { path: '/today', name: 'today', component: stub, meta: { requiresAuth: true } },
      { path: '/add', name: 'add', component: stub, meta: { requiresAuth: true } },
      {
        path: '/settings/categories',
        name: 'categories',
        component: stub,
        meta: { requiresAuth: true },
      },
      { path: '/settings', name: 'settings', component: stub, meta: { requiresAuth: true } },
      {
        path: '/settings/connectors',
        name: 'settings-connectors',
        component: stub,
        meta: { requiresAuth: true },
      },
      { path: '/import', name: 'import', component: stub, meta: { requiresAuth: true } },
      { path: '/bin', name: 'bin', component: stub, meta: { requiresAuth: true } },
      { path: '/onboarding', name: 'onboarding', component: stub, meta: { requiresAuth: true } },
    ],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  if (signedIn) useSessionStore().user = { id: '1', email: 'a@b.com' } as never;
  await router.push(path);
  await router.isReady();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(App);
  app.use(pinia);
  app.use(router);
  app.mount(el);
  await nextTick();
  return { el, app };
}

describe('App background motion (spec 006 T017)', () => {
  const urls = (f: ReturnType<typeof vi.fn>) =>
    f.mock.calls.map((c) => String(c[0]).replace(/^.*\/api/, ''));
  const flagFetch = () =>
    vi
      .fn()
      .mockImplementation(
        async (url: string) =>
          new Response(
            JSON.stringify(
              String(url).includes('/flags') ? { flags: { 'appearance.motion': true } } : {},
            ),
            { status: 200 },
          ),
      );
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const setVisibility = (s: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    setVisibility('visible');
    document.documentElement.removeAttribute('data-motion-paused');
  });

  it('renders the background layer once', async () => {
    const { el, app } = await mount('/', true, flagFetch());
    expect(el.querySelectorAll('[data-testid="background-motion"]')).toHaveLength(1);
    app.unmount();
  });

  it('pauses while the tab is hidden and resumes when visible (user has not paused)', async () => {
    const { app } = await mount('/', true, flagFetch());
    await flush();
    const html = document.documentElement;
    expect(html.hasAttribute('data-motion-paused')).toBe(false);
    setVisibility('hidden');
    await nextTick();
    expect(html.hasAttribute('data-motion-paused')).toBe(true);
    setVisibility('visible');
    await nextTick();
    expect(html.hasAttribute('data-motion-paused')).toBe(false);
    app.unmount();
  });

  it('signed out requests /flags/public and never /flags', async () => {
    const f = flagFetch();
    const { app } = await mount('/login', false, f);
    await flush();
    expect(urls(f)).toContain('/flags/public');
    expect(urls(f)).not.toContain('/flags');
    app.unmount();
  });

  it('signed in requests /flags and never /flags/public', async () => {
    const f = flagFetch();
    const { app } = await mount('/', true, f);
    await flush();
    expect(urls(f)).toContain('/flags');
    expect(urls(f)).not.toContain('/flags/public');
    app.unmount();
  });
});

describe('App free colours (ADR-0008)', () => {
  const html = document.documentElement;
  const v = (k: string) => html.style.getPropertyValue(k);
  const colours = { accentCustom: '#e8c11a', groundTint: '#2244aa', navColour: '#ff3366' };
  const withFlags = (flags: Record<string, boolean>) =>
    vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ flags }), { status: 200 }));
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    html.removeAttribute('data-theme');
    html.removeAttribute('style');
  });

  it('applies a signed-in user colours when appearance.accent is on, and clears them on sign-out', async () => {
    const { app } = await mount('/', true, withFlags({ 'appearance.accent': true }));
    const session = useSessionStore();
    session.user = { ...session.user, ...colours } as never;
    await flush();
    expect(v('--ground-tint')).toBe('#2244aa');
    expect(v('--nav-colour')).toBe('#ff3366');
    expect(v('--color-accent')).not.toBe('');
    session.user = null;
    await flush();
    for (const k of [
      '--ground-tint',
      '--nav-colour',
      '--nav-colour-fg',
      '--color-accent',
      '--color-accent-fg',
    ])
      expect(v(k)).toBe('');
    app.unmount();
  });

  it('shows nothing while the flag is off', async () => {
    const { app } = await mount('/', true, withFlags({}));
    const session = useSessionStore();
    session.user = { ...session.user, ...colours } as never;
    await flush();
    expect(v('--ground-tint')).toBe('');
    expect(v('--color-accent')).toBe('');
    app.unmount();
  });

  it('redraws the accent when the theme changes', async () => {
    const { app } = await mount('/', true, withFlags({ 'appearance.accent': true }));
    const session = useSessionStore();
    session.user = { ...session.user, accentCustom: '#e8c11a', theme: 'light' } as never;
    await flush();
    const light = v('--color-accent');
    session.user = { ...(session.user as object), theme: 'dark' } as never;
    await flush();
    expect(v('--color-accent')).not.toBe(light);
    app.unmount();
  });
});

describe('App shell (ADR-0008)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });
  const flush = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const links = (el: HTMLElement, root: string) =>
    [...el.querySelectorAll<HTMLAnchorElement>(`${root} nav a`)].map((a) => [
      a.textContent!.trim(),
      a.getAttribute('href'),
    ]);

  it('renders the sidebar and the bottom bar with the same items, one "Main" nav each', async () => {
    const { el, app } = await mount('/', true);
    const side = links(el, '.desk-sidebar');
    expect(side).toEqual([
      ['Month', '/'],
      ['Year', '/year'],
      ['Settings', '/settings'],
    ]);
    // The bottom bar is the same nav with the labelled Add link in the middle.
    expect(links(el, '.desk-bottom-bar')).toEqual([
      ['Month', '/'],
      ['Year', '/year'],
      ['Add', '/add'],
      ['Settings', '/settings'],
    ]);
    expect(el.querySelectorAll('.desk-sidebar nav[aria-label="Main"]')).toHaveLength(1);
    expect(el.querySelectorAll('.desk-bottom-bar nav[aria-label="Main"]')).toHaveLength(1);
    app.unmount();
  });

  it('has at most five items, each with an icon and a visible text label', async () => {
    const { el, app } = await mount('/', true);
    const items = el.querySelectorAll('.desk-bottom-bar nav a');
    expect(items.length).toBeLessThanOrEqual(5);
    for (const a of items) {
      expect(a.querySelector('svg')).not.toBeNull();
      expect(a.querySelector('.nav-label')!.textContent!.trim()).not.toBe('');
    }
    app.unmount();
  });

  it('switches between the two navs at 1024px, one stroke weight, no accent text', () => {
    const css = shellSources.join('\n');
    expect(css).toMatch(/@media \(min-width: 1024px\)/);
    expect(css).toMatch(/@media \(max-width: 1023px\)/);
    expect(css).toMatch(/stroke-width:\s*1\.75/);
    expect(css).toMatch(/var\(--nav-colour,/);
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(css).not.toMatch(/(^|[;{\s])color:\s*var\(--color-accent\)/);
  });

  it.each([
    ['/', 'Month'],
    ['/add', 'Month'],
    ['/settings/categories', 'Settings'],
  ])('marks exactly one item aria-current=page on %s', async (path, label) => {
    const { el, app } = await mount(path, true);
    const current = el.querySelectorAll('.desk-bottom-bar nav a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent!.trim()).toBe(label);
    expect(el.querySelectorAll('.desk-sidebar nav a[aria-current="page"]')).toHaveLength(1);
    app.unmount();
  });

  it('shows the Today item only when panels.today is on', async () => {
    const off = await mount('/', true);
    expect(off.el.querySelector('nav a[href="/today"]')).toBeNull();
    off.app.unmount();
    document.body.innerHTML = '';
    const on = await mount(
      '/',
      true,
      vi
        .fn()
        .mockImplementation(
          async () => new Response('{"flags":{"panels.today":true}}', { status: 200 }),
        ),
    );
    await flush();
    expect(on.el.querySelectorAll('nav a[href="/today"]')).toHaveLength(2);
    on.app.unmount();
  });

  it('links Personalise to the appearance section of Settings in the sidebar when a flag is on', async () => {
    for (const flag of ['appearance.motion', 'appearance.accent']) {
      const { el, app } = await mount(
        '/',
        true,
        vi
          .fn()
          .mockImplementation(
            async () => new Response(JSON.stringify({ flags: { [flag]: true } }), { status: 200 }),
          ),
      );
      await flush();
      expect(el.querySelector('.desk-sidebar a[href="/settings#appearance"]')).not.toBeNull();
      expect(el.querySelector('.desk-sidebar')!.textContent).toContain('Your money, at a glance.');
      app.unmount();
    }
  });

  it('hides Personalise when neither appearance flag is on', async () => {
    const { el, app } = await mount('/', true);
    await flush();
    expect(el.querySelector('.desk-sidebar a[href="/settings#appearance"]')).toBeNull();
    expect(el.querySelector('.desk-sidebar')!.textContent).toContain('Your money, at a glance.');
    app.unmount();
  });

  it('shows the current screen title in the top bar', async () => {
    const { el, app } = await mount('/year', true);
    expect(el.querySelector('.desk-topbar')!.textContent).toContain('Year');
    app.unmount();
  });

  it('puts the skip link first, targeting the main container', async () => {
    const { el, app } = await mount('/', true);
    const first = el.querySelector<HTMLElement>('a[href], button, [tabindex="0"]')!;
    expect(first.getAttribute('data-testid')).toBe('skip-link');
    expect(first.getAttribute('href')).toBe('#main');
    expect(first.textContent!.trim()).toBe('Skip to content');
    const main = el.querySelector('#main')!;
    expect(main.getAttribute('tabindex')).toBe('-1');
    // The views render their own <main>; the container must not nest a second one.
    expect(main.tagName).not.toBe('MAIN');
    app.unmount();
  });

  it('keeps the skip link at least 44px tall, text centred', () => {
    const rule = /\.desk-skip-link\s*\{([^}]*)\}/.exec(appSource)![1]!;
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/display:\s*inline-flex/);
    expect(rule).toMatch(/align-items:\s*center/);
  });

  it('moves focus to the main container after a navigation, not on first load', async () => {
    const { el, app } = await mount('/', true);
    await flush();
    const main = el.querySelector<HTMLElement>('#main')!;
    expect(document.activeElement).not.toBe(main);
    await app.config.globalProperties.$router.push('/year');
    await flush();
    expect(document.activeElement).toBe(main);
    app.unmount();
  });

  it('leaves focus alone when the new screen already moved it inside (a dialog, an autofocused field)', async () => {
    const { el, app } = await mount('/', true);
    await flush();
    const router = app.config.globalProperties.$router;
    router.addRoute({
      path: '/focuses',
      component: {
        template: '<input id="own-focus" />',
        mounted() {
          (this as unknown as { $el: HTMLElement }).$el.focus();
        },
      },
      meta: { requiresAuth: true },
    });
    await router.push('/focuses');
    await flush();
    expect(document.activeElement).toBe(el.querySelector('#own-focus'));
    app.unmount();
  });

  it('keeps the Feedback panel clear of the bottom bar below 1024px', () => {
    expect(feedbackSource).toMatch(
      /@media \(max-width: 1023px\)[^{]*\{[^{]*\{[^}]*bottom:[^;]*safe-area-inset-bottom/,
    );
    expect(feedbackSource).toMatch(/desk-bottom-bar/);
  });

  it('draws the Feedback panel with tokens only: no literal colours, the overlay shadow', async () => {
    const { el, app } = await mount('/', true);
    expect(el.querySelector('.feedback-toggle, .feedback-widget button')).toBeNull();
    expect(feedbackSource).not.toMatch(/2713/);
    expect(feedbackSource).not.toMatch(/color:\s*white|rgba?\(|#[0-9a-f]{3,8}\b/i);
    expect(feedbackSource).toMatch(/--shadow-overlay/);
    app.unmount();
  });

  it('leaves the page title to the top bar: no view renders its own h1', async () => {
    const { readFileSync } = await import('node:fs');
    for (const v of [
      'Add',
      'Bin',
      'Categories',
      'Category',
      'Connections',
      'Connectors',
      'Import',
      'Settings',
      'Year',
      'Month',
    ])
      expect(readFileSync(`src/views/${v}View.vue`, 'utf8'), v).not.toMatch(/<h1[\s>]/);
  });

  it('is hidden on auth pages and during onboarding', async () => {
    for (const [path, signedIn] of [
      ['/login', false],
      ['/onboarding', true],
    ] as const) {
      const { el, app } = await mount(path, signedIn);
      expect(el.querySelector('nav')).toBeNull();
      expect(el.querySelector('.desk-sidebar, .desk-bottom-bar, .desk-topbar')).toBeNull();
      app.unmount();
      document.body.innerHTML = '';
    }
  });
});

describe('Sign out', () => {
  it('lives in the sidebar and in Settings, not in the phone top bar', () => {
    expect(topBarSource).not.toContain('sign-out');
    expect(topBarSource).not.toContain('signOut');
    expect(appSource).not.toMatch(/<TopBar[^>]*sign-out/);
  });

  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    vi.unstubAllGlobals();
  });
  const flush = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  };

  it.each([
    ['the API signs the session out', new Response(null, { status: 204 })],
    ['the logout request fails', new TypeError('network down')],
  ])('leaves the current screen for /login when %s', async (_, result) => {
    const fetchImpl = vi.fn((url: string) =>
      String(url).includes('/auth/logout')
        ? result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve(result)
        : // after sign-out the app loads /flags/public, which always carries `flags`
          Promise.resolve(new Response('{"flags":{}}', { status: 200 })),
    );
    const mounted = await mount('/year', true, fetchImpl as never);
    app = mounted.app;
    const router = app.config.globalProperties.$router;
    mounted.el.querySelector<HTMLButtonElement>('[data-testid="sign-out"]')!.click();
    await flush();
    expect(router.currentRoute.value.path).toBe('/login');
    expect(useSessionStore().user).toBeNull();
  });
});

describe('Signed-out backdrop (ADR-0007 amendment 2026-10-18)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows the cycling backdrop instead of the motion layer on sign-in', async () => {
    const m = await mount('/login', false);
    app = m.app;
    expect(m.el.querySelector('.desk-auth-backdrop')).not.toBeNull();
    expect(m.el.querySelector('[data-testid="background-motion"]')).toBeNull();
  });

  it('keeps the motion layer on signed-in screens', async () => {
    const m = await mount('/year', true);
    app = m.app;
    expect(m.el.querySelector('.desk-auth-backdrop')).toBeNull();
    expect(m.el.querySelector('[data-testid="background-motion"]')).not.toBeNull();
  });
});
