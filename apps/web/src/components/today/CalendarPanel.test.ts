process.env.TZ = 'UTC';

import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayResponseT } from '@desk/contracts';
import CalendarPanel from './CalendarPanel.vue';
import { useTodayStore } from '../../stores/today.js';

const NOW = new Date('2026-09-30T12:00:00Z'); // Wed 30 Sep 2026, UTC

async function render(setup: (store: ReturnType<typeof useTodayStore>) => void) {
  const stub = { template: '<div />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/settings/connections', name: 'settings-connections', component: stub },
    ],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  setup(useTodayStore());
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(CalendarPanel);
  app.use(pinia);
  app.use(router);
  app.mount(el);
  await nextTick();
  return el;
}

function payload(overrides: Partial<TodayResponseT> = {}): TodayResponseT {
  return {
    days: [],
    messages: [],
    accounts: [
      {
        id: 'acc-1',
        provider: 'google',
        label: 'Personal',
        colour: 'teal',
        capabilities: ['calendar'],
        status: 'connected',
        lastRefreshAt: '2026-09-30T11:00:00Z',
        lastError: null,
        stale: false,
        purged: false,
        unreadCount: 0,
      },
    ],
    generatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('CalendarPanel', () => {
  let localeSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    localeSpy?.mockRestore();
  });

  function stubLocale(locale: string) {
    localeSpy = vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(locale);
  }

  it('shows Today, Tomorrow, then weekday-day-month headings for the rest of the week', async () => {
    const el = await render((s) => {
      s.payload = payload({
        days: [
          { date: '2026-09-30', events: [] },
          { date: '2026-10-01', events: [] },
          {
            date: '2026-10-02',
            events: [
              {
                id: 'e1',
                accountId: 'acc-1',
                title: 'Standup',
                startsAt: '2026-10-02T14:00:00Z',
                endsAt: '2026-10-02T14:30:00Z',
                allDay: false,
                location: null,
                tentative: false,
                link: null,
              },
            ],
          },
        ],
      });
    });
    expect(el.textContent).toContain('Today');
    expect(el.textContent).toContain('Tomorrow');
    expect(el.textContent).toContain('Fri 2 Oct');
  });

  it('formats event times 24-hour when the locale uses a 24-hour clock', async () => {
    stubLocale('en-GB');
    const el = await render((s) => {
      s.payload = payload({
        days: [
          {
            date: '2026-09-30',
            events: [
              {
                id: 'e1',
                accountId: 'acc-1',
                title: 'Standup',
                startsAt: '2026-09-30T14:00:00Z',
                endsAt: '2026-09-30T14:30:00Z',
                allDay: false,
                location: null,
                tentative: false,
                link: 'https://calendar.example.com/e1',
              },
            ],
          },
        ],
      });
    });
    expect(el.textContent).toContain('14:00–14:30');
  });

  it('formats event times 12-hour when the locale uses a 12-hour clock', async () => {
    stubLocale('en-US');
    const el = await render((s) => {
      s.payload = payload({
        days: [
          {
            date: '2026-09-30',
            events: [
              {
                id: 'e1',
                accountId: 'acc-1',
                title: 'Standup',
                startsAt: '2026-09-30T14:00:00Z',
                endsAt: '2026-09-30T14:30:00Z',
                allDay: false,
                location: null,
                tentative: false,
                link: 'https://calendar.example.com/e1',
              },
            ],
          },
        ],
      });
    });
    expect(el.textContent).toContain('2:00 PM–2:30 PM');
  });

  it('gives the event link an accessible name with title, account, time and "opens in a new tab", and opens the provider in a new tab', async () => {
    stubLocale('en-GB');
    const el = await render((s) => {
      s.payload = payload({
        days: [
          {
            date: '2026-09-30',
            events: [
              {
                id: 'e1',
                accountId: 'acc-1',
                title: 'Standup',
                startsAt: '2026-09-30T14:00:00Z',
                endsAt: '2026-09-30T14:30:00Z',
                allDay: false,
                location: null,
                tentative: false,
                link: 'https://calendar.example.com/e1',
              },
            ],
          },
        ],
      });
    });
    const link = el.querySelector('a.event-link') as HTMLAnchorElement;
    expect(link.href).toBe('https://calendar.example.com/e1');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    const label = link.getAttribute('aria-label') ?? '';
    expect(label).toContain('Standup');
    expect(label).toContain('Personal');
    expect(label).toContain('14:00–14:30');
    expect(label).toContain('opens in a new tab');
  });

  it('renders location and a tentative mark on a tentative event', async () => {
    const el = await render((s) => {
      s.payload = payload({
        days: [
          {
            date: '2026-09-30',
            events: [
              {
                id: 'e1',
                accountId: 'acc-1',
                title: 'Offsite',
                startsAt: '2026-09-30T14:00:00Z',
                endsAt: '2026-09-30T15:00:00Z',
                allDay: false,
                location: 'Room 4B',
                tentative: true,
                link: null,
              },
            ],
          },
        ],
      });
    });
    expect(el.textContent).toContain('Room 4B');
    expect(el.textContent).toContain('Tentative');
  });

  it('shows "All day" for an all-day event instead of a time range', async () => {
    const el = await render((s) => {
      s.payload = payload({
        days: [
          {
            date: '2026-09-30',
            events: [
              {
                id: 'e1',
                accountId: 'acc-1',
                title: 'Conference',
                startsAt: '2026-09-30T00:00:00Z',
                endsAt: '2026-10-01T00:00:00Z',
                allDay: true,
                location: null,
                tentative: false,
                link: null,
              },
            ],
          },
        ],
      });
    });
    expect(el.textContent).toContain('All day');
  });

  it('shows "No events in the next seven days" when an account is connected but nothing is due', async () => {
    const el = await render((s) => {
      s.payload = payload({ days: [{ date: '2026-09-30', events: [] }] });
    });
    expect(el.textContent).toContain('No events in the next seven days');
  });

  it('shows the stale state with the last-refresh time', async () => {
    const el = await render((s) => {
      s.payload = payload({
        days: [{ date: '2026-09-30', events: [] }],
        accounts: [
          {
            id: 'acc-1',
            provider: 'google',
            label: 'Personal',
            colour: 'teal',
            capabilities: ['calendar'],
            status: 'connected',
            lastRefreshAt: '2026-09-30T09:00:00Z',
            lastError: null,
            stale: true,
            purged: false,
            unreadCount: 0,
          },
        ],
      });
    });
    expect(el.textContent).toContain('Last refreshed');
  });

  it('shows a reconnect prompt per account linking to its reconnectUrl', async () => {
    const el = await render((s) => {
      s.payload = payload({
        days: [{ date: '2026-09-30', events: [] }],
        accounts: [
          {
            id: 'acc-1',
            provider: 'google',
            label: 'Personal',
            colour: 'teal',
            capabilities: ['calendar'],
            status: 'reconnect_needed',
            lastRefreshAt: '2026-09-30T09:00:00Z',
            lastError: 'access_revoked',
            stale: true,
            purged: false,
            unreadCount: 0,
            reconnectUrl: 'https://desk.test/settings/connections?reconnect=acc-1',
          },
        ],
      });
    });
    const link = el.querySelector('a.reconnect-link') as HTMLAnchorElement;
    expect(link.href).toBe('https://desk.test/settings/connections?reconnect=acc-1');
    expect(el.textContent).toContain('Personal');
  });
});
