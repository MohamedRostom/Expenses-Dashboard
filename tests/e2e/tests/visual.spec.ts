import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
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
