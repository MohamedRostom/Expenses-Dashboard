// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { collectStories } from '@desk/ui';
import { afterEach, describe, expect, it } from 'vitest';
import CatalogueView from './CatalogueView.vue';

// T045: the catalogue DOM contract that tests/e2e/tests/visual.spec.ts (T044) relies on.
afterEach(() => document.body.replaceChildren());

async function mount() {
  const el = document.createElement('div');
  document.body.append(el);
  createApp(CatalogueView).mount(el);
  await nextTick();
  return el;
}

describe('CatalogueView', () => {
  const stories = collectStories();

  it('lists every block in an index with its purpose', async () => {
    const el = await mount();
    const links = [...el.querySelectorAll('nav[data-catalogue-index] a[data-index-link]')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(stories.map((s) => `#${s.title}`));
    const nav = el.querySelector('nav[data-catalogue-index]')!.textContent!;
    for (const s of stories) expect(nav).toContain(s.purpose);
  });

  it('gives each block a section, a back link and a usage cell per theme with its source', async () => {
    const el = await mount();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    for (const s of stories) {
      const section = el.querySelector(`section#${s.title}[data-story="${s.title}"]`)!;
      expect(section.querySelector('h2')?.textContent).toContain(s.title);
      expect(section.querySelector('a[href="#catalogue-index"]')).not.toBeNull();
      const usage = section.querySelector(`[data-usage="${s.title}"]`)!;
      for (const t of ['light', 'dark']) {
        const live = usage.querySelector(
          `[data-theme-col="${t}"] [data-theme="${t}"] [data-usage-live]`,
        )!;
        expect(live.children.length, `${s.title} ${t} live cell`).toBeGreaterThan(0);
      }
      expect(usage.querySelector('pre[data-usage-source]')?.textContent).toBe(s.usage);
    }
  });

  it('renders Dialog and Toast in place, with no placeholder text', async () => {
    const el = await mount();
    expect(el.textContent).not.toContain('Overlay block: not rendered here');
    expect(el.querySelector('#Dialog [role="dialog"]')).not.toBeNull();
    expect(el.querySelector('#Toast [role="status"]')).not.toBeNull();
    expect(document.body.querySelector(':scope > .desk-dialog-backdrop')).toBeNull();
  });
});
