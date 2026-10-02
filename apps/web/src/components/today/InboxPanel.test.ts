process.env.TZ = 'UTC';

import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayResponseT } from '@desk/contracts';
import InboxPanel from './InboxPanel.vue';
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
  const app = createApp(InboxPanel);
  app.use(pinia);
  app.use(router);
  app.mount(el);
  await nextTick();
  return el;
}

function account(
  overrides: Partial<TodayResponseT['accounts'][0]> = {},
): TodayResponseT['accounts'][0] {
  return {
    id: 'acc-1',
    provider: 'google',
    label: 'Personal',
    colour: 'teal',
    capabilities: ['mail'],
    status: 'connected',
    lastRefreshAt: '2026-09-30T11:00:00Z',
    lastError: null,
    stale: false,
    purged: false,
    unreadCount: 0,
    ...overrides,
  };
}

function message(
  overrides: Partial<TodayResponseT['messages'][0]> = {},
): TodayResponseT['messages'][0] {
  return {
    id: 'm1',
    accountId: 'acc-1',
    fromName: 'Alice Example',
    fromAddress: 'alice@example.com',
    subject: 'Invoice',
    preview: 'A short preview of the message body.',
    receivedAt: '2026-09-30T10:00:00Z',
    unread: true,
    link: 'https://mail.example.com/m1',
    ...overrides,
  };
}

function payload(overrides: Partial<TodayResponseT> = {}): TodayResponseT {
  return {
    days: [],
    messages: [message()],
    accounts: [account()],
    generatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('InboxPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('shows the sender name, subject, and a single-line ellipsised preview', async () => {
    const el = await render((s) => {
      s.payload = payload();
    });
    expect(el.textContent).toContain('Alice Example');
    expect(el.textContent).toContain('Invoice');
    expect(el.textContent).toContain('A short preview of the message body.');
  });

  it('falls back to the sender address when there is no display name', async () => {
    const el = await render((s) => {
      s.payload = payload({ messages: [message({ fromName: '' })] });
    });
    expect(el.textContent).toContain('alice@example.com');
  });

  it('shows "(no subject)" when the subject is empty', async () => {
    const el = await render((s) => {
      s.payload = payload({ messages: [message({ subject: '' })] });
    });
    expect(el.textContent).toContain('(no subject)');
  });

  it('ellipsises the preview at 200 characters on a single line', async () => {
    const long = 'x'.repeat(250);
    const el = await render((s) => {
      s.payload = payload({ messages: [message({ preview: long })] });
    });
    const previewEl = el.querySelector('.message-preview');
    expect(previewEl?.textContent).toBe('x'.repeat(200) + '...');
  });

  it('shows the time for a message received today', async () => {
    const el = await render((s) => {
      s.payload = payload({ messages: [message({ receivedAt: '2026-09-30T09:30:00Z' })] });
    });
    expect(el.textContent).toContain('9:30 AM');
  });

  it('shows "Yesterday" for a message received the day before', async () => {
    const el = await render((s) => {
      s.payload = payload({ messages: [message({ receivedAt: '2026-09-29T09:30:00Z' })] });
    });
    expect(el.textContent).toContain('Yesterday');
  });

  it('shows the date for a message received before yesterday', async () => {
    const el = await render((s) => {
      s.payload = payload({ messages: [message({ receivedAt: '2026-09-20T09:30:00Z' })] });
    });
    expect(el.textContent).toContain('Sep 20');
  });

  it("puts the full timestamp in the received time's title and in the link's accessible name", async () => {
    const el = await render((s) => {
      s.payload = payload({ messages: [message({ receivedAt: '2026-09-29T09:30:00Z' })] });
    });
    const time = el.querySelector('time.received-time') as HTMLElement;
    expect(time.title).toContain('2026');
    expect(time.title).toContain('9:30');
    const link = el.querySelector('a.message-link') as HTMLAnchorElement;
    const label = link.getAttribute('aria-label') ?? '';
    expect(label).toContain('2026');
    expect(label).toContain('9:30');
  });

  it('marks an unread message and a read message differently', async () => {
    const el = await render((s) => {
      s.payload = payload({
        messages: [message({ id: 'm1', unread: true }), message({ id: 'm2', unread: false })],
      });
    });
    const rows = el.querySelectorAll('.message');
    expect(rows[0]?.classList.contains('unread')).toBe(true);
    expect(rows[0]?.textContent).toContain('Unread');
    expect(rows[1]?.classList.contains('unread')).toBe(false);
    expect(rows[1]?.textContent).not.toContain('Unread');
  });

  it('renders the row as a link to message.link opening in a new tab, and nothing else navigable inside it', async () => {
    const el = await render((s) => {
      s.payload = payload();
    });
    const link = el.querySelector('a.message-link') as HTMLAnchorElement;
    expect(link.href).toBe('https://mail.example.com/m1');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(link.querySelectorAll('a,button').length).toBe(0);
  });

  it('shows an account chip per row and per-account unread counts', async () => {
    const el = await render((s) => {
      s.payload = payload({
        accounts: [account({ id: 'acc-1', label: 'Personal', unreadCount: 3 })],
      });
    });
    expect(el.querySelector('.account-chip')).toBeTruthy();
    expect(el.textContent).toContain('3');
  });

  it("keeps a reconnect_needed account's unread count in the total, marked possibly out of date", async () => {
    const el = await render((s) => {
      s.payload = payload({
        messages: [],
        accounts: [
          account({ id: 'acc-1', label: 'Personal', unreadCount: 2, status: 'connected' }),
          account({
            id: 'acc-2',
            label: 'Work',
            unreadCount: 5,
            status: 'reconnect_needed',
            reconnectUrl: 'https://desk.test/settings/connections?reconnect=acc-2',
          }),
        ],
      });
    });
    expect(el.textContent).toContain('7');
    expect(el.textContent).toContain('possibly out of date');
  });

  it('filters messages to the account selected via filterAccountId', async () => {
    const el = await render((s) => {
      s.payload = payload({
        accounts: [
          account({ id: 'acc-1', label: 'Personal' }),
          account({ id: 'acc-2', label: 'Work' }),
        ],
        messages: [
          message({ id: 'm1', accountId: 'acc-1', subject: 'From personal' }),
          message({ id: 'm2', accountId: 'acc-2', subject: 'From work' }),
        ],
      });
      s.filterAccountId = 'acc-2';
    });
    expect(el.textContent).toContain('From work');
    expect(el.textContent).not.toContain('From personal');
  });

  it('narrows the unread total to the account selected via filterAccountId', async () => {
    const el = await render((s) => {
      s.payload = payload({
        accounts: [
          account({ id: 'acc-1', label: 'Personal', unreadCount: 1 }),
          account({ id: 'acc-2', label: 'Work', unreadCount: 4 }),
        ],
      });
      s.filterAccountId = 'acc-2';
    });
    expect(el.querySelector('.unread-total')?.textContent?.trim()).toBe('4 unread');
  });

  it('shows "No messages in your inbox" when an account is connected but nothing is due', async () => {
    const el = await render((s) => {
      s.payload = payload({ messages: [] });
    });
    expect(el.textContent).toContain('No messages in your inbox');
  });

  it('shows the stale state with the last-refresh time', async () => {
    const el = await render((s) => {
      s.payload = payload({ accounts: [account({ stale: true })] });
    });
    expect(el.textContent).toContain('Last refreshed');
  });

  it('shows a reconnect prompt per account linking to its reconnectUrl', async () => {
    const el = await render((s) => {
      s.payload = payload({
        accounts: [
          account({
            status: 'reconnect_needed',
            stale: true,
            reconnectUrl: 'https://desk.test/settings/connections?reconnect=acc-1',
          }),
        ],
      });
    });
    const link = el.querySelector('a.reconnect-link') as HTMLAnchorElement;
    expect(link.href).toBe('https://desk.test/settings/connections?reconnect=acc-1');
  });

  it('shows code-specific error copy', async () => {
    const el = await render((s) => {
      s.error = 'connector_error';
    });
    expect(el.textContent).toContain('Connector problem');
  });

  it('shows when the refresh button can be used again while rate limited', async () => {
    const el = await render((s) => {
      s.payload = payload();
      s.retryAfterSeconds = 42;
    });
    const button = el.querySelector('button.refresh-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('42');
  });

  it('offers an enabled refresh button when not rate limited', async () => {
    const el = await render((s) => {
      s.payload = payload();
    });
    const button = el.querySelector('button.refresh-button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Refresh');
  });
});
