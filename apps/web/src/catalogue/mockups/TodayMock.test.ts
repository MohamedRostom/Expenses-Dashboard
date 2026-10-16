import { createApp, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TodayMock from './TodayMock.vue';
import { ARRIVAL_MS, COPY, DAYS, MESSAGES } from '../fixtures-today.js';

let app: App | null = null;
let host: HTMLElement;

async function mount(query = 'live=off') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
  });
  await router.push(`/__ui/mockups/today?${query}`);
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(TodayMock);
  app.use(router);
  app.mount(host);
  await flush();
  return router;
}
afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  vi.useRealTimers();
});

const $ = (sel: string) => host.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const panel = (p: string) => $(`[data-mockup-panel="${p}"]`)!;
const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
};
const unreadCount = () => Number($('[data-testid="unread-count"]')!.textContent!.match(/\d+/)![0]);
const marks = () =>
  $$('[data-mockup-panel="inbox"] button').filter((b) =>
    /mark.*read/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
  );

describe('TodayMock contract', () => {
  it('sits in the proposed wrapper with strip, calendar and inbox panels', async () => {
    await mount();
    expect($('[data-mockup-root] [data-mockup="today"]')).not.toBeNull();
    for (const p of ['strip', 'calendar', 'inbox']) expect(panel(p)).toBeTruthy();
    expect(panel('strip').querySelectorAll('[data-widget]')).toHaveLength(3);
    expect($('.mk-display')).toBeNull();
    expect($('[data-tile-primary]')).toBeNull();
  });

  it('loading shows skeletons with aria-busy in every panel', async () => {
    await mount('live=off&state=loading');
    for (const p of ['calendar', 'inbox']) {
      expect(panel(p).querySelector('[data-skeleton]')).not.toBeNull();
      expect(panel(p).querySelector('[aria-busy="true"]')).not.toBeNull();
    }
  });

  it('empty renders per-panel copy', async () => {
    await mount('live=off&state=empty');
    expect(panel('calendar').textContent).toContain(COPY.calendar.empty.title);
    expect(panel('inbox').textContent).toContain(COPY.inbox.empty.title);
    expect(panel('calendar').textContent).not.toContain(COPY.inbox.empty.title);
  });

  it('error branches on cause per panel and says it with a lamp and words', async () => {
    await mount('live=off&state=error');
    const c = panel('calendar');
    const i = panel('inbox');
    expect(c.textContent).toContain(COPY.calendar.error.reconnect.text);
    expect(i.textContent).toContain(COPY.inbox.error.rate.text);
    expect(c.textContent).not.toContain(COPY.inbox.error.rate.text);
    expect(c.querySelector('[data-lamp]')).not.toBeNull();
    expect(i.querySelector('[data-lamp]')).not.toBeNull();
  });
});

describe('inbox', () => {
  it('mark read switches lamp and word, removes the button and flips the count once', async () => {
    await mount();
    const unread = MESSAGES.filter((m) => m.unread).length;
    expect(marks()).toHaveLength(unread);
    expect(unreadCount()).toBe(unread);
    expect($('[data-testid="unread-count"]')!.className).not.toContain('mk-flip');
    const row = marks()[0]!.closest<HTMLElement>('[data-message]')!;
    expect(row.getAttribute('data-unread')).toBe('true');
    expect(row.textContent).toMatch(/unread/i);
    marks()[0]!.click();
    await flush();
    expect(marks()).toHaveLength(unread - 1);
    expect(unreadCount()).toBe(unread - 1);
    expect($('[data-testid="unread-count"]')!.className).toContain('mk-flip');
    const after = $(`[data-message="${row.getAttribute('data-message')}"]`)!;
    expect(after.getAttribute('data-unread')).toBe('false');
    expect(after.querySelector('[data-lamp]')!.getAttribute('data-lamp')).toBe('read');
    expect(after.querySelector('.td-word')!.textContent).toBe('Read');
    expect(after.textContent).not.toMatch(/unread/i);
  });

  it('live delivers one message once; live=off delivers none', async () => {
    vi.useFakeTimers();
    await mount('');
    const n = $$('[data-message]').length;
    const u = unreadCount();
    vi.advanceTimersByTime(ARRIVAL_MS + 10);
    await flush();
    expect($$('[data-message]')).toHaveLength(n + 1);
    expect(unreadCount()).toBe(u + 1);
    vi.advanceTimersByTime(60_000);
    await flush();
    expect($$('[data-message]')).toHaveLength(n + 1);
    app?.unmount();
    app = null;
    host.remove();

    await mount('live=off');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    await flush();
    expect($$('[data-message]')).toHaveLength(n);
  });
});

describe('calendar', () => {
  it('days are tabs; selecting another swaps the event list', async () => {
    await mount();
    const cal = panel('calendar');
    const tabs = [...cal.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs).toHaveLength(DAYS.length);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(cal.textContent).toContain(DAYS[0]!.events[0]!.title);
    tabs[1]!.click();
    await flush();
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    await vi.waitFor(() => expect(cal.textContent).not.toContain(DAYS[0]!.events[0]!.title));
    expect(cal.textContent).toContain(DAYS[1]!.events[0]!.title);
  });

  it('a day with no events says so', async () => {
    await mount();
    [...panel('calendar').querySelectorAll<HTMLElement>('[role="tab"]')][3]!.click();
    await flush();
    await vi.waitFor(() => expect(panel('calendar').textContent).toContain(COPY.calendar.noEvents));
  });
});

describe('settle-in', () => {
  it('is applied once on mount and not added by a re-render', async () => {
    const router = await mount();
    const settled = () => $$('.mk-settle').length;
    const n = settled();
    expect(n).toBeGreaterThan(0);
    marks()[0]!.click();
    await router.replace('/__ui/mockups/today?live=off&x=1');
    await flush();
    expect(settled()).toBe(n);
  });
});
