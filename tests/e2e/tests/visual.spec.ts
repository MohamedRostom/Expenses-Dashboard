/// <reference lib="dom" />
import { readdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { axeCheck, csrfHeaders, signUpAndVerify } from '../fixtures/index.js';

// T013 / research R5, R6: one visual block per UI story, rendered by the catalogue at `/__ui`.
//
// DOM contract for CatalogueView (T021), per story `<Block>` (the story file's basename without
// `.story.ts`):
//   <section id="<Block>" data-story="<Block>">
//     <div data-theme-col="light"><div data-theme="light">...block...</div></div>
//     <div data-theme-col="dark"><div data-theme="dark">...block...</div></div>
//   </section>
// `/__ui#<Block>` must show that section; each column's inner element carries `data-theme`.
// The catalogue makes no `/api` request. No psql() here: the visual project runs in a container.

const stories = ['components', 'charts'].flatMap((d) =>
  readdirSync(new URL(`../../../packages/ui/src/${d}/`, import.meta.url))
    .filter((f) => f.endsWith('.story.ts'))
    .map((f) => f.replace(/\.story\.ts$/, '')),
);

const viewports = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'desktop', width: 1280, height: 800 },
];

for (const block of stories) {
  for (const vp of viewports) {
    for (const theme of ['light', 'dark'] as const) {
      test(`@visual ${block} ${theme} ${vp.name}`, async ({ page }) => {
        const apiCalls: string[] = [];
        page.on('request', (r) => {
          if (new URL(r.url()).pathname.startsWith('/api')) apiCalls.push(r.url());
        });
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`/__ui#${block}`);
        const section = page.locator(`section#${block}`);
        await expect(section).toBeVisible();
        const col = section.locator(`[data-theme-col="${theme}"]`);
        await expect(col.locator('[data-theme]').first()).toHaveAttribute('data-theme', theme);
        await expect(section).toHaveScreenshot(`${block}-${theme}-${vp.name}.png`);
        expect(apiCalls).toEqual([]);
      });
    }
  }

  test(`@visual ${block} axe in both themes`, async ({ page }) => {
    await page.goto(`/__ui#${block}`);
    await expect(page.locator(`section#${block}`)).toBeVisible();
    // Scoped to this block's columns, so app chrome on the page (e.g. the feedback widget) and other
    // blocks never fail this block's check.
    for (const theme of ['light', 'dark'] as const) {
      await axeCheck(page, {
        include: `section#${block} [data-theme-col="${theme}"]`,
      });
    }
  });
}

// T023 / FR-011 / T027a: the six mock-up routes under `/__ui/mockups/<route>` (built at T027, red until then).
//
// SHARED DOM CONTRACT for the mock-ups (also relied on by mockups.spec.ts):
//   [data-mockup="<route>"]        on each mock-up root (month-view, add-expense, settings, today,
//                                  widgets); all sit inside [data-mockup-root]
//   [data-mockup-panel="<id>"]     on each panel (below-the-fold content gets an element snapshot per panel)
//     today:   strip, calendar, inbox
//     widgets: strip (interactive) and matrix (static, 5 widgets x 5 states, always rendered)
//   [data-tile-primary="figure"]   on the primary tile figure (Display role, tabular-nums, the largest text)
//   data-testid="category-name" (truncated with an ellipsis, full name as accessible name or title),
//   data-testid="entry-amount" (right-aligned cells), data-testid="tile-amount" (inside its tile)
//   [data-mockup-root]             wraps the five mock-ups
// Query strings: `?state=loading|empty|error` on every route, `?state=stale` on widgets only,
//   `?fixture=edge` on the month view, `?state=rate-arrives` (existing), `?sheet=add-widget|widget-settings`
//   on widgets, `?live=off` stops all simulation on every mock-up route (the settle-in still plays;
//   animations:'disabled' fast-forwards it). Every mock-up visual test merges live=off.
// Theme: visual tests use `prefers-color-scheme` (emulateMedia). Interactively,
//   data-testid="theme-toggle" is a radiogroup (Light, Dark, System) in the header that sets
//   data-theme on the [data-mockup-root] wrapper; nothing is stored.
// Month switcher: month-prev, month-next, month-label testids (month-view and settings).
// Expenses: an add-expense button opens a role="dialog" sheet (fields Amount, Category, Note; submit
//   "Add expense"). Rows are data-testid="entry-row", each with an entry-remove button
//   aria-label="Remove <note>".
// Widgets: data-widget="currency|weather|sunrise|spend-pace|fixed-costs"; buttons aria-label
//   "Move <Name> earlier"/"Move <Name> later", testids widget-remove, widget-settings and a strip-level
//   add-widget. Reorder by pointer drag or by the move buttons (focus stays on the equivalent button).
// Live figures carry data-live="rate|weather|pace" and get class mk-flip when they change.
// No mock-up makes an `/api` call and none needs auth, so no psql() or login helpers here.

const mockupRoutes = ['month-view', 'add-expense', 'settings', 'today', 'widgets'] as const;
const baseStates = ['default', 'loading', 'empty', 'error'] as const;
const themes = ['light', 'dark'] as const;
const statesFor = (route: string): readonly string[] =>
  route === 'widgets' ? [...baseStates, 'stale'] : baseStates;
// Every route gets live=off merged into the query.
const mockupQ = (route: string, state = 'default', extra: Record<string, string> = {}) => {
  const q = new URLSearchParams();
  if (state !== 'default') q.set('state', state);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  q.set('live', 'off');
  const str = q.toString();
  return str ? `?${str}` : '';
};
const mockupUrl = (route: string, state = 'default', extra: Record<string, string> = {}) =>
  `/__ui/mockups/${route}${mockupQ(route, state, extra)}`;

function trackApi(page: Page): string[] {
  const apiCalls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api')) apiCalls.push(r.url());
  });
  return apiCalls;
}

for (const route of mockupRoutes) {
  for (const state of statesFor(route)) {
    for (const theme of themes) {
      for (const vp of viewports) {
        test(`@visual mockup ${route} ${state} ${theme} ${vp.name}`, async ({ page }) => {
          const apiCalls = trackApi(page);
          await page.emulateMedia({ colorScheme: theme });
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(mockupUrl(route, state));
          await expect(page.locator(`[data-mockup="${route}"]`)).toBeVisible();
          await expect(page).toHaveScreenshot(`mockup-${route}-${state}-${theme}-${vp.name}.png`);
          expect(apiCalls).toEqual([]);
        });
      }
    }
  }

  for (const theme of themes) {
    for (const vp of viewports) {
      test(`@visual mockup ${route} panels ${theme} ${vp.name}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(mockupUrl(route));
        await expect(page.locator(`[data-mockup="${route}"]`)).toBeVisible();
        const panels = await page.locator('[data-mockup-panel]').all();
        expect(panels.length).toBeGreaterThan(0);
        for (const panel of panels) {
          const id = await panel.getAttribute('data-mockup-panel');
          await expect(panel).toHaveScreenshot(`mockup-${route}-${id}-${theme}-${vp.name}.png`);
        }
      });
    }
  }

  for (const state of statesFor(route)) {
    test(`@visual mockup ${route} ${state} axe in both themes`, async ({ page }) => {
      for (const theme of themes) {
        // Reduced motion: axe must not sample text mid settle-in, when it is still part transparent.
        // Colours are identical either way.
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto(mockupUrl(route, state));
        await expect(page.locator(`[data-mockup="${route}"]`)).toBeVisible();
        await axeCheck(page, {
          include: `[data-mockup="${route}"]`,
        });
      }
    });
  }
}

for (const theme of themes) {
  for (const vp of viewports) {
    test(`@visual mockup month-view edge fixture ${theme} ${vp.name}`, async ({ page }) => {
      const apiCalls = trackApi(page);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(mockupUrl('month-view', 'default', { fixture: 'edge' }));
      await expect(page.locator('[data-mockup="month-view"]')).toBeVisible();

      // edge.longCategory: apps/web/src/catalogue/fixtures.ts
      const fullName = 'Annual professional membership and training fees';
      const name = page.locator('[data-testid="category-name"]', { hasText: fullName }).first();
      await expect(name).toBeVisible();
      const m = await name.evaluate((el) => ({
        over: el.scrollWidth > el.clientWidth,
        overflow: getComputedStyle(el).textOverflow,
        label: el.getAttribute('title') ?? el.getAttribute('aria-label') ?? el.textContent,
      }));
      expect(m.over).toBe(true);
      expect(m.overflow).toBe('ellipsis');
      expect(m.label).toContain(fullName);

      // edge.largeAmount: 12345678 minor units
      const amount = page.locator('[data-testid="tile-amount"]', { hasText: '£123,456.78' });
      await expect(amount).toBeVisible();
      const box = await amount.boundingBox();
      const tileBox = await amount.locator('xpath=ancestor::*[@data-tile][1]').boundingBox();
      expect(box).not.toBeNull();
      expect(tileBox).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(tileBox!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(tileBox!.x + tileBox!.width);
      expect(box!.y).toBeGreaterThanOrEqual(tileBox!.y);
      expect(box!.y + box!.height).toBeLessThanOrEqual(tileBox!.y + tileBox!.height);

      // edge.busyDay: 30 entries, amounts share one right edge
      const rights = await page
        .locator('[data-testid="entry-amount"]')
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
      expect(rights.length).toBeGreaterThanOrEqual(30);
      expect(Math.max(...rights) - Math.min(...rights)).toBeLessThanOrEqual(1);

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expect(page).toHaveScreenshot(`mockup-month-view-edge-${theme}-${vp.name}.png`);
      expect(apiCalls).toEqual([]);
    });
  }

  // FR-011: one primary figure, the largest text on the page, tabular numerals.
  test(`@visual mockup month-view primary figure is largest ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(mockupUrl('month-view'));
    await expect(page.locator('[data-mockup="month-view"]')).toBeVisible();
    await expect(page.locator('[data-tile-primary="figure"]')).toHaveCount(1);
    const r = await page.evaluate(() => {
      const fig = document.querySelector('[data-tile-primary="figure"]')!;
      const size = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
      const figSize = size(fig);
      const rivals: string[] = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (el === fig || fig.contains(el) || el.contains(fig)) continue;
        const own = [...el.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        );
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const visible =
          rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        // a tie with a non-figure element fails, hence >=
        if (own && visible && size(el) >= figSize) {
          rivals.push(`${el.tagName.toLowerCase()} ${size(el)}px`);
        }
      }
      return { rivals, fvn: getComputedStyle(fig).fontVariantNumeric };
    });
    expect(r.rivals).toEqual([]);
    expect(r.fvn).toContain('tabular-nums');
  });
}

// T027a: widgets sheets, both themes and viewports, plus axe with the sheet open.
for (const sheet of ['add-widget', 'widget-settings']) {
  for (const theme of themes) {
    for (const vp of viewports) {
      test(`@visual mockup widgets sheet ${sheet} ${theme} ${vp.name}`, async ({ page }) => {
        const apiCalls = trackApi(page);
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(mockupUrl('widgets', 'default', { sheet }));
        await expect(page.locator('[data-mockup="widgets"]')).toBeVisible();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page).toHaveScreenshot(
          `mockup-widgets-sheet-${sheet}-${theme}-${vp.name}.png`,
        );
        expect(apiCalls).toEqual([]);
      });
    }
  }

  test(`@visual mockup widgets sheet ${sheet} axe in both themes`, async ({ page }) => {
    for (const theme of themes) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' }); // see the axe loop above
      await page.goto(mockupUrl('widgets', 'default', { sheet }));
      await expect(page.getByRole('dialog')).toBeVisible();
      await axeCheck(page); // whole page: the sheet may render outside the mock-up root
    }
  });
}

// ---------------------------------------------------------------------------------------------
// T029 / spec 004: the screen harness. Every per-screen change (T031-T042) appends ONE entry to
// SCREENS and nothing else. For each entry x {360, 1280} x {light, dark} it takes a viewport
// snapshot, element snapshots of the `panels`, runs axe (with the WCAG 2.2 target-size rule), checks
// target sizes and reduce-motion, and (opt in via `states`) snapshots forced loading/empty/error.
//
// Stack setup, not the test, turns the flags on (`pnpm flags set panels.* / widgets.* --global on`,
// see ci.yml e2e-ci): enableWidgetFlags() uses psql/docker and the visual project runs in a
// container, so it is never called from here. Signed-in entries sign up through Mailpit/the API
// (signUpAndVerify) and seed through HTTP with the CSRF header, never psql().
// Forced states are page.route mocks of the screen's own API calls; there is no ?state= query in
// apps/web (decision 2026-10-10, see tasks.md T029).
// ---------------------------------------------------------------------------------------------

type ScreenState = 'default' | 'loading' | 'empty' | 'error';
type SeedCtx = { email: string; categoryIds: string[] };
type Screen = {
  name: string;
  route: string | ((ctx: SeedCtx) => string);
  seed?: (page: Page, ctx: SeedCtx) => Promise<void>;
  flags?: 'widgets' | 'panels';
  /** CSS selectors for panels below the fold; each gets an element snapshot. */
  panels?: string[];
  signedIn?: boolean;
  /** Elements owned by a LATER task (named in a comment at the entry), left out of the target-size check. */
  targetExempt?: string;
  /** Runs after the default state has loaded (open a panel, press a key); every check sees its result. */
  afterLoad?: (page: Page) => Promise<unknown>;
  states?: ScreenState[];
  /** Seed the edge fixture (apps/web/src/catalogue/fixtures.ts): 48-char category, six-digit amount, 30-entry day. */
  edge?: boolean;
  /** Per-state mocking. `setup` runs before navigation (page.route); `after` runs once the page has loaded. */
  force?: Partial<
    Record<
      Exclude<ScreenState, 'default'>,
      { setup?: (page: Page) => Promise<unknown>; after?: (page: Page) => Promise<unknown> }
    >
  >;
};

const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const EDGE_CATEGORY = 'Annual professional membership and training fees'; // 48 chars

export const SCREENS: Screen[] = [
  {
    // T031: the shared header and the open Feedback panel, on the signed-in month view.
    name: 'shell',
    route: '/',
    signedIn: true,
    // The month switcher (26x25 prev/next) belongs to MonthView and is resized in T032, which
    // removes this exemption. Everything else in the header and the Feedback panel is checked.
    targetExempt: '[aria-label^="Previous month"], [aria-label^="Next month"]',
    panels: ['header.desk-header', '.feedback-form'],
    afterLoad: async (page) => {
      await page.getByRole('button', { name: 'Feedback' }).click();
      await expect(page.getByRole('button', { name: 'Close feedback' })).toBeVisible();
    },
  },
  {
    name: 'login',
    route: '/login',
    states: ['default', 'error'],
    force: {
      error: {
        setup: (page) =>
          page.route('**/auth/login', (route) =>
            route.fulfill({
              status: 401,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'invalid_credentials', message: 'Invalid email or password' },
              }),
            }),
          ),
        after: async (page) => {
          await page.getByLabel('Email').fill('nobody@example.com');
          await page.getByLabel('Password').fill('not-the-password-1');
          await page.getByRole('button', { name: 'Sign in' }).click();
          await expect(page.getByRole('alert')).toBeVisible();
        },
      },
    },
  },
];

/**
 * Known gaps: a check that fails today because the screen is not refreshed yet. Each entry names the
 * task that removes it; nothing is skipped silently. Keyed by screen name.
 */
type GapCheck = 'targets' | 'axe' | 'axe-target-size' | 'motion';
const KNOWN_GAPS: Record<string, { check: GapCheck; task: string }[]> = {
  // Login is refreshed at T036: 36px inputs/button and 20px links at 360, 20px links at 1280, and
  // accent-coloured link text failing contrast. T036 removes these three entries.
  login: [
    { check: 'targets', task: 'T036' },
    { check: 'axe', task: 'T036' },
    { check: 'axe-target-size', task: 'T036' },
  ],
};
const gap = (name: string, check: GapCheck) =>
  KNOWN_GAPS[name]?.some((g) => g.check === check) ?? false;

// The seed step: sign up through the UI/Mailpit/API (no psql), then seed through HTTP.
async function prepare(page: Page, screen: Screen): Promise<SeedCtx> {
  const ctx: SeedCtx = { email: '', categoryIds: [] };
  if (screen.signedIn) {
    ctx.email = `visual-${screen.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    await signUpAndVerify(page, ctx.email, PASSWORD);
    if (screen.edge) {
      const headers = await csrfHeaders(page);
      const cat = await page.request.post('/categories', {
        headers,
        data: { name: EDGE_CATEGORY, colour: '#3a6ea5' },
      });
      expect(cat.ok()).toBe(true);
      const categoryId = ((await cat.json()) as { category: { id: string } }).category.id;
      ctx.categoryIds.push(categoryId);
      const month = new Date().toISOString().slice(0, 7);
      const post = (description: string, minor: number, day: string) =>
        page.request.post('/expenses', {
          headers,
          data: {
            description,
            amount: { minor, currency: 'GBP' },
            date: `${month}-${day}`,
            categoryId,
            paidWith: 'card',
            kind: 'variable',
          },
        });
      await post('Large amount', 12_345_678, '01');
      for (let i = 0; i < 30; i++) await post(`Busy day entry ${i + 1}`, 300 + i * 125, '15');
    }
    await screen.seed?.(page, ctx);
  }
  return ctx;
}

const routeOf = (screen: Screen, ctx: SeedCtx) =>
  typeof screen.route === 'function' ? screen.route(ctx) : screen.route;

// Loading: every XHR/fetch is held open. Error: every GET fetch answers 500 in the app's envelope.
const holdFetches = (page: Page) =>
  page.route('**/*', (route) =>
    route.request().resourceType() === 'fetch' ? new Promise<void>(() => {}) : route.fallback(),
  );
const failFetches = (page: Page) =>
  page.route('**/*', (route) =>
    route.request().resourceType() === 'fetch' && route.request().method() === 'GET'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'internal', message: 'Something went wrong' } }),
        })
      : route.fallback(),
  );

async function openScreen(page: Page, screen: Screen, ctx: SeedCtx, state: ScreenState) {
  if (state === 'loading') await holdFetches(page);
  else if (state === 'error') await (screen.force?.error?.setup ?? failFetches)(page);
  else if (state === 'empty') await screen.force?.empty?.setup?.(page);
  await page.goto(routeOf(screen, ctx));
  if (state !== 'loading') {
    await page.waitForLoadState('networkidle');
    if (state !== 'default') await screen.force?.[state]?.after?.(page);
  }
  if (state === 'default') await screen.afterLoad?.(page);
}

/** Every visible, enabled focusable element must be at least `min` tall (32 in dense rows / menus). */
async function targetFailures(page: Page, min: number, exempt?: string): Promise<string[]> {
  return page.evaluate(
    ([min, exempt]) => {
      const sel = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        if ((el as HTMLButtonElement).disabled || (el as HTMLInputElement).type === 'hidden')
          continue;
        if (exempt && el.matches(exempt)) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none')
          continue;
        const need = el.closest('.desk-data-table--dense, [role="menu"]') ? Math.min(min, 32) : min;
        if (r.height + 0.5 < need) {
          const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '';
          out.push(
            `${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}x${Math.round(r.height)} < ${need}`,
          );
        }
      }
      return out;
    },
    [min, exempt] as const,
  );
}

const toSeconds = (list: string) =>
  list.split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s)));

async function motionFailures(page: Page): Promise<string[]> {
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('*')].map((el) => {
      const cs = getComputedStyle(el);
      return [el.tagName.toLowerCase(), cs.transitionDuration, cs.animationDuration] as const;
    }),
  );
  return rows
    .filter(([, t, a]) => [...toSeconds(t), ...toSeconds(a)].some((n) => n > 0))
    .map(([tag, t, a]) => `${tag} transition ${t} animation ${a}`);
}

test('@visual harness: SCREENS is non-empty and every entry is well formed', () => {
  expect(SCREENS.length).toBeGreaterThan(0);
  const names = new Set<string>();
  for (const s of SCREENS) {
    expect(s.name, 'name').toMatch(/^[a-z0-9-]+$/);
    expect(names.has(s.name), `duplicate screen ${s.name}`).toBe(false);
    names.add(s.name);
    expect(typeof s.route === 'function' || s.route.startsWith('/'), `${s.name} route`).toBe(true);
    for (const st of s.states ?? []) {
      expect(['default', 'loading', 'empty', 'error']).toContain(st);
    }
    if (s.edge || s.seed) expect(s.signedIn, `${s.name}: seeding needs signedIn`).toBe(true);
  }
  for (const entries of Object.values(KNOWN_GAPS)) {
    for (const g of entries) expect(g.task, 'a known gap names its task').toMatch(/^T\d+$/);
  }
});

for (const screen of SCREENS) {
  for (const vp of viewports) {
    for (const theme of themes) {
      test(`@visual screen ${screen.name} ${theme} ${vp.width}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const ctx = await prepare(page, screen);
        await openScreen(page, screen, ctx, 'default');
        await expect(page).toHaveScreenshot(`screen-${screen.name}-${theme}-${vp.width}.png`);
        let i = 0;
        for (const selector of screen.panels ?? []) {
          i += 1;
          const panel = page.locator(selector).first();
          await panel.scrollIntoViewIfNeeded();
          await expect(panel).toHaveScreenshot(
            `screen-${screen.name}-panel${i}-${theme}-${vp.width}.png`,
          );
        }
      });

      for (const state of (screen.states ?? []).filter((s) => s !== 'default')) {
        test(`@visual screen ${screen.name} ${state} ${theme} ${vp.width}`, async ({ page }) => {
          await page.emulateMedia({ colorScheme: theme });
          await page.setViewportSize({ width: vp.width, height: vp.height });
          const ctx = await prepare(page, screen);
          await openScreen(page, screen, ctx, state);
          await expect(page).toHaveScreenshot(
            `screen-${screen.name}-${state}-${theme}-${vp.width}.png`,
          );
        });
      }
    }

    test(`@visual screen ${screen.name} targets ${vp.width}`, async ({ page }) => {
      test.skip(
        gap(screen.name, 'targets'),
        `known gap: ${JSON.stringify(KNOWN_GAPS[screen.name])}`,
      );
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const ctx = await prepare(page, screen);
      await openScreen(page, screen, ctx, 'default');
      const min = vp.width <= 360 ? 44 : 24;
      expect(
        await targetFailures(page, min, screen.targetExempt),
        `targets under ${min}px`,
      ).toEqual([]);
      if (vp.width <= 360) {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          'no horizontal scroll at 360',
        ).toBe(true);
      }
    });
  }

  test(`@visual screen ${screen.name} axe incl. target-size in both themes`, async ({ page }) => {
    const ctx = await prepare(page, screen);
    for (const theme of themes) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await openScreen(page, screen, ctx, 'default');
      if (!gap(screen.name, 'axe')) await axeCheck(page);
      if (gap(screen.name, 'axe-target-size')) continue;
      // axeCheck's tag set (wcag2a/aa) leaves the WCAG 2.2 rule off; run it explicitly.
      const res = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
      expect(
        res.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.html}`)),
        'axe target-size (WCAG 2.2)',
      ).toEqual([]);
    }
  });

  test(`@visual screen ${screen.name} reduced motion`, async ({ page }) => {
    test.skip(gap(screen.name, 'motion'), `known gap: ${JSON.stringify(KNOWN_GAPS[screen.name])}`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const ctx = await prepare(page, screen);
    await openScreen(page, screen, ctx, 'default');
    expect(await motionFailures(page), 'non-zero transition/animation duration').toEqual([]);
  });
}

// T044: usage examples in the catalogue (red until T045 builds them).
//
// DOM contract, added to each story's section (and one index at the top of the page):
//   <section id="<Block>" data-story="<Block>">
//     ... existing theme columns ...
//     <div data-usage="<Block>">
//       <div data-theme-col="light"><div data-theme="light"><div data-usage-live>live cell</div></div></div>
//       <div data-theme-col="dark"><div data-theme="dark"><div data-usage-live>live cell</div></div></div>
//       <pre data-usage-source>...usage string...</pre>
//     </div>
//   </section>
//   <nav data-catalogue-index> <a href="#<Block>" data-index-link>...</a> + purpose text per block </nav>
test.describe('@visual usage examples (T044)', () => {
  const usageThemes = ['light', 'dark'] as const;
  const overlays = ['Dialog', 'Toast'];

  for (const block of stories) {
    for (const vp of viewports) {
      for (const theme of usageThemes) {
        test(`@visual usage ${block} ${theme} ${vp.name}`, async ({ page }) => {
          const apiCalls: string[] = [];
          page.on('request', (r) => {
            if (new URL(r.url()).pathname.startsWith('/api')) apiCalls.push(r.url());
          });
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(`/__ui#${block}`);
          const live = page
            .locator(`[data-usage="${block}"] [data-theme-col="${theme}"] [data-usage-live]`)
            .first();
          await expect(live).toBeVisible();
          await expect(live).toHaveScreenshot(`usage-${block}-${theme}-${vp.name}.png`);
          expect(apiCalls).toEqual([]);
        });
      }

      test(`@visual usage source ${block} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`/__ui#${block}`);
        const source = page.locator(`[data-usage="${block}"] pre[data-usage-source]`);
        await expect(source).toBeVisible();
        expect((await source.textContent())?.trim()).toContain(`<${block}`);
        await expect(source).toHaveScreenshot(`usage-source-${block}-${vp.name}.png`);
      });
    }

    test(`@visual usage ${block} axe in both themes`, async ({ page }) => {
      await page.goto(`/__ui#${block}`);
      await expect(page.locator(`[data-usage="${block}"]`)).toBeVisible();
      for (const theme of usageThemes) {
        await axeCheck(page, {
          include: `[data-usage="${block}"] [data-theme-col="${theme}"]`,
        });
      }
    });
  }

  for (const block of overlays.filter((b) => stories.includes(b))) {
    test(`@visual usage ${block} renders inline`, async ({ page }) => {
      await page.goto(`/__ui#${block}`);
      for (const theme of usageThemes) {
        const live = page
          .locator(`[data-usage="${block}"] [data-theme-col="${theme}"] [data-usage-live]`)
          .first();
        await expect(live).toBeVisible();
        const inside = live.locator(
          block === 'Dialog' ? '[role="dialog"]' : '[role="status"], [role="alert"]',
        );
        await expect(inside.first()).toBeVisible();
        const position = await inside.first().evaluate((el) => getComputedStyle(el).position);
        expect(position).not.toBe('fixed');
      }
    });
  }

  test('@visual catalogue index links every block', async ({ page }) => {
    await page.goto('/__ui');
    const links = page.locator('[data-catalogue-index] a[data-index-link]');
    await expect(links).toHaveCount(stories.length);
    for (const block of stories) {
      const link = page.locator(`[data-catalogue-index] a[data-index-link][href="#${block}"]`);
      await expect(link).toHaveCount(1);
      await expect(page.locator(`[data-catalogue-index]`)).toContainText(/\S/);
    }
    const last = stories[stories.length - 1]!;
    await page.locator(`[data-catalogue-index] a[href="#${last}"]`).click();
    await expect(page.locator(`section#${last}`)).toBeInViewport();
  });

  test('@visual DataTable columns do not overlap at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/__ui#DataTable');
    const section = page.locator('section#DataTable');
    const light = (await section.locator('[data-theme-col="light"]').first().boundingBox())!;
    const dark = (await section.locator('[data-theme-col="dark"]').first().boundingBox())!;
    const separate = dark.y >= light.y + light.height - 1 || dark.x >= light.x + light.width - 1;
    expect(separate).toBe(true);
    const header = section.locator('[data-theme-col="dark"] th', { hasText: 'Budget' }).first();
    await header.scrollIntoViewIfNeeded();
    await expect(header).toBeVisible();
    const topmost = await header.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === el || el.contains(hit);
    });
    expect(topmost).toBe(true);
  });
});
