/// <reference lib="dom" />
import { readdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { axeCheck } from '../fixtures/index.js';

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

// Known gap, decided 2026-10-05: dark --color-critical (#a83a2e, ~2.8:1) stays unchanged in Phase 2
// because the look must not change; the fix is a design decision at T028 (see packages/ui
// tokens.test.ts known-gap case). Only colour contrast in the dark column of these blocks is skipped.
const DARK_CRITICAL_GAP_T028 = ['Button', 'ErrorState', 'Input', 'Select', 'PanelFrame'];

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
      const knownGap = theme === 'dark' && DARK_CRITICAL_GAP_T028.includes(block);
      await axeCheck(page, {
        include: `section#${block} [data-theme-col="${theme}"]`,
        disableRules: knownGap ? ['color-contrast'] : [],
      });
    }
  });
}

// T023 / FR-011 / T027a: the six mock-up routes under `/__ui/mockups/<route>` (built at T027, red until then).
//
// SHARED DOM CONTRACT for the mock-ups (also relied on by mockups.spec.ts):
//   [data-mockup="<route>"]        on each mock-up root (month-view, add-expense, settings, today,
//                                  widgets, month-view-fallback); today and widgets sit inside
//                                  [data-identity="proposed"] like the other proposed routes
//   [data-mockup-panel="<id>"]     on each panel (below-the-fold content gets an element snapshot per panel)
//     today:   strip, calendar, inbox
//     widgets: strip (interactive) and matrix (static, 5 widgets x 5 states, always rendered)
//   [data-tile-primary="figure"]   on the primary tile figure (Display role, tabular-nums, the largest text)
//   data-testid="category-name" (truncated with an ellipsis, full name as accessible name or title),
//   data-testid="entry-amount" (right-aligned cells), data-testid="tile-amount" (inside its tile)
//   [data-identity="proposed"]     wraps the five proposed mock-ups; month-view-fallback has no such wrapper
// Query strings: `?state=loading|empty|error` on every route, `?state=stale` on widgets only,
//   `?fixture=edge` on the month view, `?state=rate-arrives` (existing), `?sheet=add-widget|widget-settings`
//   on widgets, `?live=off` stops all simulation on proposed routes (the settle-in still plays;
//   animations:'disabled' fast-forwards it). Every proposed-route visual test merges live=off.
// Theme: visual tests use `prefers-color-scheme` (emulateMedia). Interactively,
//   data-testid="theme-toggle" is a radiogroup (Light, Dark, System) in the header that sets
//   data-theme on the [data-identity="proposed"] wrapper; nothing is stored.
// Month switcher: month-prev, month-next, month-label testids (month-view and settings).
// Expenses: an add-expense button opens a role="dialog" sheet (fields Amount, Category, Note; submit
//   "Add expense"). Rows are data-testid="entry-row", each with an entry-remove button
//   aria-label="Remove <note>".
// Widgets: data-widget="currency|weather|sunrise|spend-pace|fixed-costs"; buttons aria-label
//   "Move <Name> earlier"/"Move <Name> later", testids widget-remove, widget-settings and a strip-level
//   add-widget. Reorder by pointer drag or by the move buttons (focus stays on the equivalent button).
// Live figures carry data-live="rate|weather|pace" and get class mk-flip when they change.
// No mock-up makes an `/api` call and none needs auth, so no psql() or login helpers here.

const mockupRoutes = [
  'month-view',
  'add-expense',
  'settings',
  'today',
  'widgets',
  'month-view-fallback',
] as const;
const baseStates = ['default', 'loading', 'empty', 'error'] as const;
const themes = ['light', 'dark'] as const;
const statesFor = (route: string): readonly string[] =>
  route === 'widgets' ? [...baseStates, 'stale'] : baseStates;
// Proposed routes get live=off merged into the query; the fallback route does not.
const mockupQ = (route: string, state = 'default', extra: Record<string, string> = {}) => {
  const q = new URLSearchParams();
  if (state !== 'default') q.set('state', state);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  if (route !== 'month-view-fallback') q.set('live', 'off');
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
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(mockupUrl(route, state));
        await expect(page.locator(`[data-mockup="${route}"]`)).toBeVisible();
        // Same known gap as DARK_CRITICAL_GAP_T028 above: dark critical red (~2.8:1) is decided at
        // T028. Only colour contrast, only in dark, only for the fallback route and error states.
        const knownGap = theme === 'dark' && (route === 'month-view-fallback' || state === 'error');
        await axeCheck(page, {
          include: `[data-mockup="${route}"]`,
          disableRules: knownGap ? ['color-contrast'] : [],
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
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(mockupUrl('widgets', 'default', { sheet }));
      await expect(page.getByRole('dialog')).toBeVisible();
      await axeCheck(page); // whole page: the sheet may render outside the mock-up root
    }
  });
}
