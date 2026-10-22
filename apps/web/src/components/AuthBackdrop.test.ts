import { createApp, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthBackdrop, { SCENE_COUNT, HOLD_MS } from './AuthBackdrop.vue';

function stubMedia(matching: string[] = []) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: matching.includes(q),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

async function mount(animate = true) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp({ render: () => h(AuthBackdrop, { animate }) });
  app.mount(el);
  await nextTick();
  return { el, app };
}
const active = (el: HTMLElement) =>
  el.querySelector('.desk-auth-scene.is-active')?.getAttribute('data-scene');

describe('AuthBackdrop (signed-out pages, ADR-0007 amendment 2026-10-18)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    stubMedia();
  });
  afterEach(() => {
    app?.unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('draws ten decorative scenes with exactly one showing', async () => {
    const m = await mount();
    app = m.app;
    const root = m.el.querySelector('.desk-auth-backdrop')!;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(m.el.querySelectorAll('.desk-auth-scene')).toHaveLength(SCENE_COUNT);
    expect(SCENE_COUNT).toBe(10);
    expect(m.el.querySelectorAll('.desk-auth-scene.is-active')).toHaveLength(1);
  });

  it('shuffles through every scene once before any repeats', async () => {
    const m = await mount();
    app = m.app;
    const seen = [active(m.el)];
    for (let i = 1; i < SCENE_COUNT; i++) {
      vi.advanceTimersByTime(HOLD_MS);
      await nextTick();
      seen.push(active(m.el));
    }
    expect(new Set(seen).size).toBe(SCENE_COUNT);
  });

  it.each([
    ['the motion flag is off', false, []],
    ['reduced motion is asked for', true, ['(prefers-reduced-motion: reduce)']],
    ['reduced data is asked for', true, ['(prefers-reduced-data: reduce)']],
  ])('holds one still scene when %s', async (_, animate, media) => {
    stubMedia(media as string[]);
    const m = await mount(animate as boolean);
    app = m.app;
    const first = active(m.el);
    vi.advanceTimersByTime(HOLD_MS * 3);
    await nextTick();
    expect(active(m.el)).toBe(first);
    expect(m.el.querySelector('.desk-auth-backdrop')!.classList.contains('is-still')).toBe(true);
  });

  it('holds the same first scene whenever it is still, so the page renders the same every time', async () => {
    for (const r of [0, 0.5, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const m = await mount(false);
      expect(active(m.el)).toBe('1');
      m.app.unmount();
      vi.mocked(Math.random).mockRestore();
    }
  });

  it('pauses while the tab is hidden and resumes when it is shown', async () => {
    const m = await mount();
    app = m.app;
    const first = active(m.el);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(HOLD_MS * 3);
    await nextTick();
    expect(active(m.el)).toBe(first);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(HOLD_MS);
    await nextTick();
    expect(active(m.el)).not.toBe(first);
  });
});
