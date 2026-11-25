import { createPinia, setActivePinia } from 'pinia';
import { createApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it } from 'vitest';
import AppSidebar from './AppSidebar.vue';
import { useFeedback } from '../../composables/useFeedback.js';

describe('AppSidebar footer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    useFeedback().closeFeedback();
  });

  it('has a Feedback button above Sign out, and no Add link', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }],
    });
    await router.push('/');
    const pinia = createPinia();
    setActivePinia(pinia);
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp(AppSidebar).use(pinia).use(router);
    app.mount(el);
    const foot = [...el.querySelectorAll<HTMLButtonElement>('.side-foot button')];
    expect(foot.map((b) => b.textContent!.trim())).toEqual(['Feedback', 'Sign out']);
    expect(el.querySelector('nav a[href="/add"]')).toBeNull();
    foot[0]!.click();
    expect(useFeedback().open.value).toBe(true);
    app.unmount();
  });
});
