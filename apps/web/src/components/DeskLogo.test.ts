import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import LoginView from '../views/LoginView.vue';

describe('DeskLogo on the sign-in screen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sits above the heading, reads as the product name once, and draws in theme colours', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', component: LoginView }],
    });
    await router.push('/login');
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp(LoginView).use(createPinia()).use(router).mount(el);
    await nextTick();

    const logo = el.querySelector('.desk-logo')!;
    expect(logo).not.toBeNull();
    expect(logo.compareDocumentPosition(el.querySelector('h1')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(logo.textContent?.trim()).toBe('Desk');
    const mark = logo.querySelector('svg')!;
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    // The Desk sign: a silver D crossed by two cobalt bars on a graphite cell, in fixed brand
    // colours (the same mark on light and dark grounds).
    const d = mark.querySelector('path.desk-logo-d')!;
    expect(d.getAttribute('stroke')).toMatch(/^url\(#.+\)$/);
    const bars = [...mark.querySelectorAll('rect.desk-logo-bar')];
    expect(bars.map((b) => b.getAttribute('fill'))).toEqual(['#3d6bff', '#3d6bff']);
  });

  it('gives each logo its own gradient ids so two on one page do not collide', async () => {
    const { default: DeskLogo } = await import('./DeskLogo.vue');
    const el = document.createElement('div');
    document.body.appendChild(el);
    createApp({ render: () => [h(DeskLogo), h(DeskLogo)] }).mount(el);
    await nextTick();
    const ids = [...el.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
