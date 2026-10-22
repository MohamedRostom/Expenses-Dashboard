/// <reference lib="dom" />
import { readdirSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
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

type ScreenState = 'default' | 'loading' | 'empty' | 'error' | 'offline';
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
  /** page.route mocks for every state, set before navigation: pins what depends on today's date. */
  mock?: (page: Page) => Promise<unknown>;
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

// T033 helpers: open the add sheet with `n`; fail the save; fill the form and save.
const openSheet = async (page: Page) => {
  // The 'n' shortcut exists only once MonthView has mounted (its route chunk loads lazily).
  await expect(page.getByRole('button', { name: 'Add expense' }).first()).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: 'Add expense' })).toBeVisible();
};
const failSave = (page: Page) =>
  page.route('**/expenses', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'internal', message: 'Could not save' } }),
        })
      : route.fallback(),
  );
const fillAndSave = async (page: Page) => {
  const form = page.locator('.desk-expense-form');
  await form.getByLabel('Description').fill('Lunch');
  await form.getByLabel('Amount', { exact: true }).fill('12.50');
  await form.getByRole('button', { name: 'Add expense' }).click();
  await expect(form.getByRole('alert')).toBeVisible();
};

// T034 helper: one budgeted category the screens can open (id lands in ctx.categoryIds[0]).
const seedCategory = async (page: Page, ctx: SeedCtx) => {
  const res = await page.request.post('/categories', {
    headers: await csrfHeaders(page),
    data: { name: 'Pet care', colour: '#3a6ea5', budgetMinor: 25_000 },
  });
  expect(res.ok()).toBe(true);
  ctx.categoryIds.push(((await res.json()) as { category: { id: string } }).category.id);
};

// T037: a fixed /panels/today payload (a Google and a Microsoft account), built from the local
// clock so "Today" and "Tomorrow" headings and the message times hold on any day.
const at = (dayOffset: number, h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mockToday = (page: Page) =>
  page.route('**/panels/today', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const account = (
      id: string,
      provider: 'google' | 'microsoft',
      label: string,
      unread: number,
      colour: string,
    ) => ({
      id,
      provider,
      label,
      colour,
      capabilities: ['calendar', 'mail'],
      status: 'connected',
      lastRefreshAt: new Date().toISOString(),
      lastError: null,
      stale: false,
      purged: false,
      unreadCount: unread,
    });
    const event = (
      id: string,
      acc: string,
      title: string,
      s: Date,
      e: Date,
      location: string | null,
    ) => ({
      id,
      accountId: acc,
      title,
      startsAt: s.toISOString(),
      endsAt: e.toISOString(),
      allDay: false,
      location,
      tentative: false,
      link: 'https://calendar.example.test/e/' + id,
    });
    const message = (
      id: string,
      acc: string,
      name: string,
      subject: string,
      d: Date,
      unread: boolean,
    ) => ({
      id,
      accountId: acc,
      fromName: name,
      fromAddress: 'sender@example.test',
      subject,
      preview: 'A short preview of the message body that runs on long enough to be cut off.',
      receivedAt: d.toISOString(),
      unread,
      link: 'https://mail.example.test/m/' + id,
    });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        accounts: [
          account('a1', 'google', 'mo@example.test', 2, 'teal'),
          account('a2', 'microsoft', 'work@example.test', 0, 'blue'),
        ],
        days: [
          {
            date: ymd(at(0, 0, 0)),
            events: [
              event('e1', 'a1', 'Standup', at(0, 9, 30), at(0, 9, 45), null),
              event(
                'e2',
                'a2',
                'Quarterly review with finance',
                at(0, 14, 0),
                at(0, 15, 30),
                'Room 4',
              ),
            ],
          },
          {
            date: ymd(at(1, 0, 0)),
            events: [event('e3', 'a1', 'Dentist', at(1, 8, 15), at(1, 9, 0), null)],
          },
        ],
        messages: [
          message('m1', 'a1', 'Priya Raman', 'Invoice 4471 is ready', at(0, 8, 12), true),
          message('m2', 'a2', 'Tomas Berg', 'Moving the review to Thursday', at(0, 7, 40), true),
          message(
            'm3',
            'a1',
            'Linden Library',
            'Your hold is ready to collect',
            at(0, 6, 5),
            false,
          ),
        ],
      }),
    });
  });

// T040 helpers. Year: the summaries are pinned (month names and today's date would move the
// baselines); the old year.spec.ts snapshots moved into the 'year' entry.
const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });
const mockYear = async (page: Page) => {
  const year = new Date().getFullYear();
  const spent = [42_000, 51_500, 38_250, 47_900, 120_000, 44_100, 0, 0, 0, 0, 0, 0];
  await page.route('**/summary/year*', (route) =>
    route.fulfill(
      json({
        year,
        currency: 'GBP',
        months: spent.map((v, i) => ({
          month: `${year}-${String(i + 1).padStart(2, '0')}`,
          spent: v,
          budgeted: i < 6 ? 80_000 : 0,
        })),
      }),
    ),
  );
  await page.route('**/summary/compare*', (route) =>
    route.fulfill(
      json({
        a: `${year}-06`,
        b: `${year}-05`,
        byCategory: [
          { categoryId: 'g', delta: -12_500 },
          { categoryId: 'r', delta: 4_000 },
          { categoryId: 't', delta: 1_250 },
        ],
      }),
    ),
  );
  await page.route('**/categories', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill(
          json({
            categories: [
              ['g', 'Groceries'],
              ['r', 'Rent'],
              ['t', 'Transport'],
            ].map(([id, name], i) => ({ id, name, colour: '#3a6ea5', sortOrder: i })),
          }),
        )
      : route.fallback(),
  );
};
// Bin: one expense, deleted through the API so the bin has a row.
const seedBin = async (page: Page) => {
  const headers = await csrfHeaders(page);
  const me = (await (await page.request.get('/me')).json()) as {
    user: { defaultCurrency: string };
  };
  const res = await page.request.post('/expenses', {
    headers,
    data: {
      description: 'Lunch at the station café',
      amount: { minor: 1_250, currency: me.user.defaultCurrency },
      date: '2026-03-14',
      categoryId: null,
      paidWith: 'card',
      kind: 'variable',
    },
  });
  expect(res.ok()).toBe(true);
  const id = ((await res.json()) as { expense: { id: string } }).expense.id;
  expect((await page.request.delete(`/expenses/${id}`, { headers })).ok()).toBe(true);
};

// T042 helpers. The strip's own API answers are pinned (fixed figures, no Open-Meteo or rate
// fetch), so the baselines hold on any day; the real widget flows are covered in widgets.spec.ts.
const IN_ZONE = '2026-03-14T09:12:00Z';
const mockWidgets = async (page: Page) => {
  const base = { settings: {}, state: 'ready', asOf: IN_ZONE, position: 0 };
  const widgets = [
    {
      ...base,
      id: 'w1',
      kind: 'currency',
      figures: {
        rows: [
          {
            code: 'EUR',
            rate: 1.1842,
            rateDate: '2026-03-13',
            prevChange: { pct: 0.2, direction: 'up' },
            monthChange: { pct: 0.8, direction: 'down', since: '2026-02-12' },
          },
        ],
      },
    },
    {
      ...base,
      id: 'w2',
      kind: 'weather',
      figures: {
        place: 'Leeds',
        temperatureC: 14,
        condition: 'Light cloud',
        icon: 'cloud',
        todayMaxC: 17,
        todayMinC: 9,
        outlook: [
          { date: '2026-03-15', maxC: 16, minC: 8, icon: 'sun', condition: 'Sunny' },
          { date: '2026-03-16', maxC: 18, minC: 10, icon: 'rain', condition: 'Rain' },
        ],
        observedAt: IN_ZONE,
        attribution: 'Weather data by Open-Meteo.com',
      },
    },
    {
      ...base,
      id: 'w3',
      kind: 'spend_pace',
      figures: {
        spentMinor: 61_250,
        budgetMinor: 150_000,
        pct: 41,
        daysLeft: 12,
        dailyToBudgetMinor: 7_396,
        overBudget: false,
      },
    },
    {
      ...base,
      id: 'w4',
      kind: 'fixed_costs',
      figures: {
        remaining: [
          { categoryId: 'a', name: 'Rent', usualMinor: 95_000, usualBasis: 'budget' },
          { categoryId: 'b', name: 'Internet', usualMinor: 3_200, usualBasis: 'previous' },
        ],
        totalExpectedMinor: 98_200,
        allRecorded: false,
      },
    },
  ].map((w, position) => ({ ...w, position }));
  const get = (body: unknown) => (route: Route) =>
    route.request().method() === 'GET' ? route.fulfill(json(body)) : route.fallback();
  await page.route('**/widgets', get({ widgets, limit: 6, temperatureUnit: 'C' }));
  await page.route(
    '**/widgets/types',
    get({
      types: [
        ['currency', 'Currency', 'Exchange rates against your default currency.'],
        ['sunrise', 'Sunrise and sunset', "Today's sunrise, sunset and day length."],
      ].map(([kind, name, description]) => ({
        kind,
        name,
        description,
        enabled: true,
        needsPlace: kind === 'sunrise',
        settingsSchema: {},
      })),
    }),
  );
  await page.route('**/widgets/refresh', (route) => route.fulfill(json({ queued: 0 })));
};

export const SCREENS: Screen[] = [
  {
    // T031: the shared header and the open Feedback panel, on the signed-in month view.
    name: 'shell',
    route: '/',
    signedIn: true,
    panels: ['header.desk-header', '.feedback-form'],
    afterLoad: async (page) => {
      await page.getByRole('button', { name: 'Feedback' }).click();
      await expect(page.getByRole('button', { name: 'Close feedback' })).toBeVisible();
    },
  },
  {
    // T032: the month view. Edge fixture (48-char category, six-digit amount, 30-entry day); the
    // category and entries panels sit below the fold at 360. Forced states mock the month fetch.
    name: 'month',
    route: '/',
    signedIn: true,
    edge: true,
    panels: ['[data-panel="categories"]', '[data-panel="entries"]'],
    // The forecast depends on the day of the month; pin it so baselines hold on any day.
    mock: (page) =>
      page.route('**/summary/forecast*', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            month: new Date().toISOString().slice(0, 7),
            currency: 'USD',
            spentToDate: 33_500,
            committedFixed: 0,
            forecast: 50_882,
            basis: ['spend to date', 'variable run-rate'],
          }),
        }),
      ),
    states: ['loading', 'empty', 'error'],
    force: {
      empty: {
        setup: async (page) => {
          await page.route('**/expenses?month=*', (route) =>
            route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify({
                expenses: [],
                summary: {
                  month: new Date().toISOString().slice(0, 7),
                  currency: 'GBP',
                  spent: 0,
                  budgeted: 0,
                  remaining: 0,
                  byCategory: [],
                  pendingRates: 0,
                },
              }),
            }),
          );
          // An empty GBP month forecasts nothing (T048: it showed the default mock's USD figure).
          await page.route('**/summary/forecast*', (route) =>
            route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify({
                month: new Date().toISOString().slice(0, 7),
                currency: 'GBP',
                spentToDate: 0,
                committedFixed: 0,
                forecast: 0,
                basis: ['spend to date'],
              }),
            }),
          );
        },
      },
    },
  },
  {
    // T033: the add-expense page (the same form as the sheet), its failed save and its validation.
    name: 'add',
    route: '/add',
    signedIn: true,
    states: ['default', 'error'],
    force: { error: { setup: failSave, after: fillAndSave } },
  },
  {
    // T033: submitting the empty form shows the validation message under the form.
    name: 'add-invalid',
    route: '/add',
    signedIn: true,
    afterLoad: async (page) => {
      const form = page.locator('.desk-expense-form');
      await form.getByRole('button', { name: 'Add expense' }).click();
      await expect(form.getByRole('alert')).toBeVisible();
    },
  },
  {
    // T033: the sheet opened from the month view with the `n` shortcut: a bottom sheet at 360, a
    // side panel from 1024.
    name: 'add-sheet',
    route: '/',
    signedIn: true,
    panels: ['[role="dialog"]'],
    afterLoad: openSheet,
    states: ['default', 'error'],
    force: {
      error: {
        setup: failSave,
        after: async (page) => {
          await openSheet(page);
          await fillAndSave(page);
          // The sticky action row keeps Save in view, so the sheet's own scroll offset depends on
          // timing; pin it to the top so the snapshot is stable.
          await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, 0));
        },
      },
    },
  },
  {
    // T034: the category list and its budget editor (Dialog). Seeds one budgeted category so the
    // board has a row; the budget carries an amount in the figure face.
    name: 'categories',
    route: '/settings/categories',
    signedIn: true,
    seed: seedCategory,
    states: ['loading', 'empty', 'error'],
    force: {
      empty: {
        setup: (page) =>
          page.route('**/categories', (route) =>
            // fetch only: the same glob also matches the page's own navigation to this URL, which
            // used to render the JSON body as the "empty" baseline.
            route.request().method() === 'GET' && route.request().resourceType() === 'fetch'
              ? route.fulfill({ contentType: 'application/json', body: '{"categories":[]}' })
              : route.fallback(),
          ),
      },
    },
  },
  {
    // T034: the budget editor open over the board.
    name: 'categories-edit',
    route: '/settings/categories',
    signedIn: true,
    panels: ['[role="dialog"]'],
    afterLoad: async (page) => {
      await page.getByRole('row', { name: /Rent/ }).getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('dialog', { name: 'Edit category' })).toBeVisible();
    },
  },
  {
    // T034: one category's spend history (twelve months, mostly empty for a new user).
    name: 'category',
    route: (ctx) => `/settings/categories/${ctx.categoryIds[0]}`,
    signedIn: true,
    seed: seedCategory,
    states: ['loading', 'error'],
  },
  {
    // T035: settings. Section index + flap sections; one <main>, content inset by the gutter.
    name: 'settings',
    route: '/settings',
    signedIn: true,
    panels: ['#st-sessions', '#st-delete'],
    // The Sessions row prints the session's real device and "Last seen" time, which change every
    // run (width of "4:08 AM" vs "11:42 AM"). Pin one row; the year is the current one so the
    // stamp stays year-less on any date (formatSeen drops it).
    mock: (page) =>
      page.route(/\/me\/sessions$/, (route) =>
        route.fulfill(
          json({
            sessions: [
              {
                id: 'visual-session-1',
                current: true,
                lastSeenAt: new Date(new Date().getFullYear(), 2, 14, 9, 30).toISOString(),
                userAgent:
                  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
              },
            ],
          }),
        ),
      ),
    states: ['loading', 'error'],
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
                error: { code: 'unauthenticated', message: 'Invalid email or password' },
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
  {
    // T036: the other error branch, distinct copy for 429. The default state already shows it.
    name: 'login-limited',
    route: '/login',
    mock: (page) =>
      page.route('**/auth/login', (route) =>
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many attempts' } }),
        }),
      ),
    afterLoad: async (page) => {
      await page.getByLabel('Email').fill('nobody@example.com');
      await page.getByLabel('Password').fill('not-the-password-1');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  {
    // T037: Today. The providers are mocked at the app's own endpoint (page.route on
    // GET /panels/today with a fixed payload), not through mockProvider: the real connect flow
    // waits on the API's 30s job tick and its dates would move the baselines. Dates are built from
    // the local clock but only "Today"/"Tomorrow" headings and fixed hours are shown.
    name: 'today',
    route: '/today',
    signedIn: true,
    flags: 'panels',
    panels: ['[data-panel="calendar"]', '[data-panel="inbox"]'],
    mock: mockToday,
    states: ['loading', 'empty', 'error', 'offline'],
    force: {
      empty: {
        setup: (page) =>
          page.route('**/panels/today', (route) =>
            route.request().method() === 'GET'
              ? route.fulfill({
                  contentType: 'application/json',
                  body: JSON.stringify({
                    days: [],
                    messages: [],
                    accounts: [],
                    generatedAt: new Date().toISOString(),
                  }),
                })
              : route.fallback(),
          ),
      },
    },
  },
  {
    // T040: the year view (moved from year.spec.ts): the total tile, month bars with a table
    // fallback, and the month comparison panel. Summaries are pinned by mockYear.
    name: 'year',
    route: '/year',
    signedIn: true,
    mock: mockYear,
    panels: ['section[role="region"]:has(.desk-year-bars)', '[data-testid="month-compare"]'],
    states: ['loading', 'error'],
  },
  {
    // T040: the CSV import, step one (the file chooser). The later steps need an uploaded file.
    name: 'import',
    route: '/import',
    signedIn: true,
    states: ['loading'],
  },
  {
    // T040: the bin with one deleted expense.
    name: 'bin',
    route: '/bin',
    signedIn: true,
    seed: seedBin,
    states: ['loading', 'empty', 'error'],
    force: {
      empty: {
        setup: (page) =>
          page.route('**/expenses?*', (route) => route.fulfill(json({ expenses: [] }))),
      },
    },
  },
  {
    // T042: the widget strip under the month view (pinned answers from mockWidgets).
    name: 'widgets-month',
    route: '/',
    signedIn: true,
    flags: 'widgets',
    mock: mockWidgets,
    panels: ['[data-testid="widget-strip"]'],
    states: ['loading', 'error'],
  },
  {
    // T042: the same strip on Today.
    name: 'widgets-today',
    route: '/today',
    signedIn: true,
    flags: 'widgets',
    mock: async (page) => {
      await mockWidgets(page);
      await mockToday(page);
    },
    panels: ['[data-testid="widget-strip"]'],
  },
  {
    // T042: the add-widget sheet (Dialog) open over the strip.
    name: 'widgets-add-sheet',
    route: '/',
    signedIn: true,
    flags: 'widgets',
    mock: mockWidgets,
    panels: ['[role="dialog"]'],
    afterLoad: async (page) => {
      await page.getByTestId('add-widget').click();
      await expect(page.getByRole('dialog', { name: 'Add widget' })).toBeVisible();
    },
  },
  {
    // T042: a widget's settings sheet open (its menu, then Settings).
    name: 'widgets-settings-sheet',
    route: '/',
    signedIn: true,
    flags: 'widgets',
    mock: mockWidgets,
    panels: ['[role="dialog"]'],
    afterLoad: async (page) => {
      await page.locator('summary[aria-label="Weather menu"]').click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    // T039: the account screens. Anonymous; forced errors mock the screen's own POST.
    name: 'register',
    route: '/register',
    states: ['default', 'error'],
    force: {
      error: {
        setup: (page) =>
          page.route('**/auth/register', (route) =>
            route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'validation_failed', message: 'Request failed' },
              }),
            }),
          ),
        after: async (page) => {
          await page.getByLabel('Email').fill('nobody@example.com');
          await page.getByLabel('Password').fill('not-the-password-1');
          await page.getByRole('button', { name: 'Sign up' }).click();
          await expect(page.getByRole('alert')).toBeVisible();
        },
      },
    },
  },
  {
    // T039: the confirmation shown after the request (the endpoint always answers the same).
    name: 'forgot',
    route: '/forgot',
    afterLoad: async (page) => {
      await page.getByLabel('Email').fill('nobody@example.com');
      await page.getByRole('button', { name: 'Send reset link' }).click();
      await expect(page.getByText('If that email exists')).toBeVisible();
    },
  },
  {
    name: 'forgot-form',
    route: '/forgot',
  },
  {
    // T039: reset form; the error state is an expired or used link, through ErrorState.
    name: 'reset',
    route: '/reset?token=expired',
    states: ['default', 'error'],
    force: {
      error: {
        setup: (page) =>
          page.route('**/auth/password/reset', (route) =>
            route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'validation_failed', message: 'Invalid or expired token' },
              }),
            }),
          ),
        after: async (page) => {
          await page.getByLabel('New password').fill('not-the-password-1');
          await page.getByRole('button', { name: 'Reset password' }).click();
          await expect(page.getByRole('alert')).toBeVisible();
        },
      },
    },
  },
  {
    // T039: an expired or used verification link (default) and the check in progress (loading).
    name: 'verify',
    route: '/verify?token=expired',
    mock: (page) =>
      page.route('**/auth/verify', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'validation_failed', message: 'Invalid or expired token' },
              }),
            })
          : route.fallback(),
      ),
    states: ['loading'],
  },
  {
    // T039: onboarding step 1. A completed user may still open it (the guard only bounces away from
    // other routes), so no psql is needed to get an unfinished one.
    name: 'onboarding',
    route: '/onboarding',
    signedIn: true,
  },
  {
    // T041: the settings sub-screens. A new user has no capture address, no Notion connection and
    // no connected accounts, so each shows its first-run state; forced loading/error from the stack.
    name: 'capture',
    route: '/settings/capture',
    signedIn: true,
    states: ['loading', 'error'],
  },
  {
    name: 'connectors',
    route: '/settings/connectors',
    signedIn: true,
    states: ['loading'],
  },
  {
    name: 'connections',
    route: '/settings/connections',
    signedIn: true,
    states: ['loading', 'error'],
  },
];

/**
 * Known gaps: a check that fails today because the screen is not refreshed yet. Each entry names the
 * task that removes it; nothing is skipped silently. Keyed by screen name.
 */
type GapCheck = 'targets' | 'axe' | 'axe-target-size' | 'motion';
const KNOWN_GAPS: Record<string, { check: GapCheck; task: string }[]> = {};
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
        // A budget keeps the hero a Display figure (no budget makes it words; FR-011 needs a figure).
        data: { name: EDGE_CATEGORY, colour: '#3a6ea5', budgetMinor: 20_000_000 },
      });
      expect(cat.ok()).toBe(true);
      const categoryId = ((await cat.json()) as { category: { id: string } }).category.id;
      ctx.categoryIds.push(categoryId);
      // The user's own default currency, so every seeded amount counts toward the month's tiles
      // (a foreign amount would wait for a rate and leave the tiles at zero).
      const me = (await (await page.request.get('/me')).json()) as {
        user: { defaultCurrency: string };
      };
      const currency = me.user.defaultCurrency;
      const month = new Date().toISOString().slice(0, 7);
      const post = (description: string, minor: number, day: string) =>
        page.request.post('/expenses', {
          headers,
          data: {
            description,
            amount: { minor, currency },
            date: `${month}-${day}`,
            categoryId,
            paidWith: 'card',
            kind: 'variable',
          },
        });
      await post('Large amount', 12_345_678, '01');
      for (let i = 0; i < 30; i++) await post(`Busy day entry ${i + 1}`, 300 + i * 125, '15');
      // One over-budget category so the bars' gutter lamp is in the baselines.
      const over = await page.request.post('/categories', {
        headers,
        data: { name: 'Client dinners', colour: '#b5651d', budgetMinor: 5_000 },
      });
      expect(over.ok()).toBe(true);
      const overId = ((await over.json()) as { category: { id: string } }).category.id;
      await page.request.post('/expenses', {
        headers,
        data: {
          description: 'Team dinner',
          amount: { minor: 7_500, currency },
          date: `${month}-10`,
          categoryId: overId,
          paidWith: 'card',
          kind: 'variable',
        },
      });
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

// Ready = the app has mounted something, no skeleton is showing and the DOM has been quiet for 500 ms
// (data arriving re-renders it). networkidle is not used: it also counts sockets, fonts and the
// like, and timed out on bin/empty; requests answered through the service worker are invisible to
// request events, so those cannot be counted either.
async function ready(page: Page) {
  await expect(page.locator('#app > *').first()).toBeVisible();
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        let timer = setTimeout(done, 500);
        const obs = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, 500);
        });
        function done() {
          obs.disconnect();
          // Skeleton.vue sets no aria-busy, so look for its class as well.
          resolve(!document.querySelector('[aria-busy="true"], .desk-skeleton'));
        }
        obs.observe(document.body, { subtree: true, childList: true, characterData: true });
      }),
    undefined,
    { timeout: 15_000 },
  );
}

async function openScreen(page: Page, screen: Screen, ctx: SeedCtx, state: ScreenState) {
  await screen.mock?.(page);
  if (state === 'loading') await holdFetches(page);
  else if (state === 'error') await (screen.force?.error?.setup ?? failFetches)(page);
  else if (state === 'empty') await screen.force?.empty?.setup?.(page);
  await page.goto(routeOf(screen, ctx));
  if (state !== 'loading') {
    await ready(page);
    if (state !== 'default') await screen.force?.[state]?.after?.(page);
  }
  if (state === 'default') await screen.afterLoad?.(page);
  // Offline: the screen loads normally, then the network drops; the app keeps the last content.
  if (state === 'offline') {
    await page.context().setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);
  }
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

// T032 edge and FR-011 assertions on the real month view (copied from the mock-up tests above).
for (const vp of viewports) {
  test(`@visual screen month edge fixture and primary figure ${vp.width}`, async ({ page }) => {
    const screen = SCREENS.find((s) => s.name === 'month')!;
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const ctx = await prepare(page, screen);
    await openScreen(page, screen, ctx, 'default');

    // Long category name: ellipsised, full value as title.
    const name = page.locator('[data-testid="category-name"]', { hasText: EDGE_CATEGORY }).first();
    await expect(name).toBeVisible();
    const m = await name.evaluate((el) => ({
      over: el.scrollWidth > el.clientWidth,
      overflow: getComputedStyle(el).textOverflow,
      label: el.getAttribute('title') ?? el.getAttribute('aria-label') ?? el.textContent,
    }));
    // Spec 006 T044: the Categories panel grows to fill the row (flex 1 1 380px), so at 1280 the
    // 48-character name fits whole; it only has to overflow where the panel is a phone's width.
    if (vp.width < 768) expect(m.over).toBe(true);
    expect(m.overflow).toBe('ellipsis');
    expect(m.label).toContain(EDGE_CATEGORY);

    // Six-digit amount stays inside its tile.
    const amounts = page.locator('[data-testid="tile-amount"]');
    await expect(amounts.filter({ hasText: /\d{3},\d{3}\.\d{2}/ }).first()).toBeVisible();
    for (const amount of await amounts.all()) {
      const box = (await amount.boundingBox())!;
      const tileBox = (await amount.locator('xpath=ancestor::*[@data-tile][1]').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(tileBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(tileBox.x + tileBox.width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(tileBox.y + tileBox.height + 0.5);
    }

    // 30-entry day: amounts share one right edge.
    const rights = await page
      .locator('[data-testid="entry-amount"]')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    expect(rights.length).toBeGreaterThanOrEqual(30);
    expect(Math.max(...rights) - Math.min(...rights)).toBeLessThanOrEqual(1);

    // No sideways scroll (the 13px overflow at 360).
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'no horizontal scroll',
    ).toBe(true);

    // FR-011: one primary figure, the largest text on the page, tabular numerals.
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
        if (own && visible && size(el) >= figSize)
          rivals.push(`${el.tagName.toLowerCase()} ${size(el)}px`);
      }
      return { rivals, fvn: getComputedStyle(fig).fontVariantNumeric };
    });
    expect(r.rivals).toEqual([]);
    expect(r.fvn).toContain('tabular-nums');
  });
}

// Finish-review: at 360 the first viewport holds the departure tile, the smaller tiles and the head
// of the first board (Categories since spec 006 T044; the widget strip sits after the tiles and is
// empty with no widgets), and the add sheet's submit button is inside the viewport without scrolling.
test('@visual screen month categories board starts inside the first viewport 360', async ({
  page,
}) => {
  const screen = SCREENS.find((s) => s.name === 'month')!;
  await page.setViewportSize({ width: 360, height: 800 });
  const ctx = await prepare(page, screen);
  await openScreen(page, screen, ctx, 'default');
  const box = (await page.locator('[data-panel="categories"]').boundingBox())!;
  expect(box.y, 'categories panel top').toBeLessThan(800);
});

test('@visual screen add-sheet submit is visible without scrolling 360', async ({ page }) => {
  const screen = SCREENS.find((s) => s.name === 'add-sheet')!;
  await page.setViewportSize({ width: 360, height: 800 });
  const ctx = await prepare(page, screen);
  await openScreen(page, screen, ctx, 'default');
  // The sheet slides in on --motion-slow; the assertion retries until it has settled.
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Add expense' }),
  ).toBeInViewport({ ratio: 1 });
});

// T035: Settings has exactly one <main> and its content is inset by the same gutter as the month view.
for (const vp of viewports) {
  test(`@visual screen settings main landmark and gutter ${vp.width}`, async ({ page }) => {
    const screen = SCREENS.find((s) => s.name === 'settings')!;
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const ctx = await prepare(page, screen);
    await openScreen(page, screen, ctx, 'default');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('main h1')).toBeVisible();
    const left = (sel: string) =>
      page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().left, sel);
    const settingsLeft = await left('main h1');
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    const homeLeft = await left('main');
    const homeInner = await page.evaluate(() => {
      const m = document.querySelector('main')!;
      return m.getBoundingClientRect().left + parseFloat(getComputedStyle(m).paddingLeft);
    });
    expect(settingsLeft).toBeGreaterThanOrEqual(16);
    expect(Math.abs(settingsLeft - homeInner)).toBeLessThanOrEqual(1);
    expect(homeLeft).toBeGreaterThanOrEqual(0);
  });
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
      expect(['default', 'loading', 'empty', 'error', 'offline']).toContain(st);
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
