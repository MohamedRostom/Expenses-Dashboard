import { createApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it } from 'vitest';
import TopBar from './TopBar.vue';
import source from './TopBar.vue?raw';
import { titleFor } from './navItems.js';

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }],
  });
  await router.push(path);
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(TopBar).use(router);
  app.mount(el);
  return { el, app };
}

describe('TopBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the screen title as the page h1, with an actions slot inside the header', async () => {
    const { el, app } = await mountAt('/settings/categories/abc');
    const header = el.querySelector('header.desk-topbar[data-testid="top-bar"]')!;
    expect(header).not.toBeNull();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(header.querySelector('h1')?.textContent).toBe('Category history');
    expect(header.querySelector('div#top-bar-actions')).not.toBeNull();
    app.unmount();
  });

  it('every page gets the bar height Month has: its title row is a button-height row', () => {
    expect(source).toMatch(/\.top-title \{[^}]*min-block-size: var\(--target-min\)/);
  });

  it('may wrap on a phone, with the actions at the end', () => {
    expect(source).toMatch(/flex-wrap:\s*wrap/);
    expect(source).toMatch(/#top-bar-actions|\.top-actions/);
  });
});

describe('titleFor', () => {
  it.each([
    ['/', 'Month'],
    ['/add', 'Add expense'],
    ['/settings', 'Settings'],
    ['/settings/categories', 'Categories'],
    ['/settings/categories/abc', 'Category history'],
    ['/settings/connectors', 'Notion sync'],
    ['/settings/connections', 'Mail and calendar accounts'],
  ])('%s -> %s', (path, title) => {
    expect(titleFor(path)).toBe(title);
  });
});
