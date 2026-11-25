import { createPinia, setActivePinia } from 'pinia';
import { createApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import BottomBar from './BottomBar.vue';
import source from './BottomBar.vue?raw';

async function mountBar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }],
  });
  await router.push('/');
  const pinia = createPinia();
  setActivePinia(pinia);
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(BottomBar).use(pinia).use(router);
  app.mount(el);
  return { el, app };
}

describe('BottomBar Add', () => {
  it('is a labelled link to /add in the middle of the one Main nav', async () => {
    const { el, app } = await mountBar();
    expect(el.querySelectorAll('nav[aria-label="Main"]')).toHaveLength(1);
    const links = [...el.querySelectorAll<HTMLAnchorElement>('nav a')];
    const labels = links.map((a) => a.textContent!.trim());
    expect(labels).toEqual(['Month', 'Year', 'Add', 'Settings']);
    expect(links[2]!.getAttribute('href')).toBe('/add');
    app.unmount();
  });

  it('is at least the 44px target and the pill uses the radius token', () => {
    expect(source).toMatch(/min-height:\s*var\(--target-min\)/);
    expect(source).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(source).not.toMatch(/border-radius:\s*32px/);
  });
});
