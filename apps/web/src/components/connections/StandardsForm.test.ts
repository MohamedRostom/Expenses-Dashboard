import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StandardsForm from './StandardsForm.vue';

const PRESETS = [
  {
    name: 'yahoo',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    caldavUrl: 'https://caldav.calendar.yahoo.com',
  },
  {
    name: 'icloud',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    caldavUrl: 'https://caldav.icloud.com',
  },
  {
    name: 'fastmail',
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    caldavUrl: 'https://caldav.fastmail.com',
  },
];

function mount(props: Record<string, unknown> = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(StandardsForm, { presets: PRESETS, ...props });
  const instance = app.mount(el);
  return { el, app, instance };
}

function setInput(el: Element, selector: string, value: string) {
  const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  if (!input) throw new Error(`missing input: ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event(selector.includes('select') ? 'change' : 'input'));
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('StandardsForm — connect mode', () => {
  it('offers presets for yahoo, icloud, fastmail and other', () => {
    const { el, app } = mount();
    const select = el.querySelector<HTMLSelectElement>('select[name="preset"]');
    expect(select).not.toBeNull();
    const optionLabels = [...select!.options].map((o) => o.value);
    expect(optionLabels).toEqual(['', 'yahoo', 'icloud', 'fastmail', 'other']);
    app.unmount();
  });

  it('fills IMAP host, port and CalDAV URL from the chosen preset', async () => {
    const { el, app } = mount();
    const select = el.querySelector<HTMLSelectElement>('select[name="preset"]')!;
    select.value = 'fastmail';
    select.dispatchEvent(new Event('change'));
    await nextTick();

    expect(el.querySelector<HTMLInputElement>('input[name="imapHost"]')!.value).toBe(
      'imap.fastmail.com',
    );
    expect(el.querySelector<HTMLInputElement>('input[name="imapPort"]')!.value).toBe('993');
    expect(el.querySelector<HTMLInputElement>('input[name="caldavUrl"]')!.value).toBe(
      'https://caldav.fastmail.com',
    );
    app.unmount();
  });

  it('has an address field, an app password field with a "never shown again" note, and mail/calendar capability checkboxes', () => {
    const { el, app } = mount();
    expect(el.querySelector('input[name="address"]')).not.toBeNull();
    const password = el.querySelector<HTMLInputElement>('input[name="password"]');
    expect(password).not.toBeNull();
    expect(password!.type).toBe('password');
    expect(el.textContent).toContain('never shown again');
    expect(el.querySelector('input[name="capability-mail"]')).not.toBeNull();
    expect(el.querySelector('input[name="capability-calendar"]')).not.toBeNull();
    app.unmount();
  });

  it('submits POST /connections/standards with the entered fields and emits success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account: {
            id: 'acc-9',
            provider: 'standards',
            address: 'me@fastmail.com',
            label: 'me@fastmail.com',
            colour: 'teal',
            capabilities: ['mail'],
            grantedScopes: [],
            status: 'connected',
            pausedAt: null,
            lastRefreshAt: null,
            lastError: null,
            calendars: [],
          },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { el, app, instance } = mount();
    const successHandler = vi.fn();
    (instance.$.vnode.props as Record<string, unknown>)['onSuccess'] = successHandler;

    setInput(el, 'input[name="address"]', 'me@fastmail.com');
    setInput(el, 'input[name="password"]', 'app-password-123');
    const mailCheckbox = el.querySelector<HTMLInputElement>('input[name="capability-mail"]')!;
    mailCheckbox.checked = true;
    mailCheckbox.dispatchEvent(new Event('change'));
    setInput(el, 'input[name="imapHost"]', 'imap.fastmail.com');
    setInput(el, 'input[name="imapPort"]', '993');
    await nextTick();

    const form = el.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/connections/standards', expect.anything()),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      address: 'me@fastmail.com',
      password: 'app-password-123',
      imapHost: 'imap.fastmail.com',
      imapPort: 993,
      capabilities: ['mail'],
    });

    await vi.waitFor(() =>
      expect(successHandler).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-9' })),
    );
    app.unmount();
  });

  it('requires at least one capability before submitting', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = mount();

    setInput(el, 'input[name="address"]', 'me@fastmail.com');
    setInput(el, 'input[name="password"]', 'app-password-123');
    await nextTick();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await nextTick();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Choose mail, calendar or both');
    app.unmount();
  });

  it('ties a field error to its input with aria-describedby and moves focus to the error summary', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = mount();

    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await nextTick();

    const summary = el.querySelector('[data-testid="standards-form-error-summary"]');
    expect(summary).not.toBeNull();
    expect(document.activeElement).toBe(summary);

    const capabilityGroup = el.querySelector('[data-testid="capability-group"]');
    const describedBy = capabilityGroup!.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorEl = el.querySelector(`#${describedBy}`);
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain('Choose mail, calendar or both');
    app.unmount();
  });

  it.each([
    ['connect', "couldn't reach that server"],
    ['login', 'address or app password was rejected'],
    ['inbox', "inbox couldn't be opened"],
    ['discovery', 'no calendar was found'],
  ])(
    'shows step-specific copy for verification_failed { step: %s }',
    async (step, expectedText) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: { code: 'verification_failed', message: 'failed', details: { step } },
            }),
            { status: 422 },
          ),
        );
      vi.stubGlobal('fetch', fetchMock);
      const { el, app } = mount();

      setInput(el, 'input[name="address"]', 'me@fastmail.com');
      setInput(el, 'input[name="password"]', 'app-password-123');
      const mailCheckbox = el.querySelector<HTMLInputElement>('input[name="capability-mail"]')!;
      mailCheckbox.checked = true;
      mailCheckbox.dispatchEvent(new Event('change'));
      setInput(el, 'input[name="imapHost"]', 'imap.fastmail.com');
      setInput(el, 'input[name="imapPort"]', '993');
      await nextTick();
      el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

      await vi.waitFor(() => expect(el.textContent).toContain(expectedText));
      app.unmount();
    },
  );

  it('shows copy for a rate-limited submission', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'too many' } }), {
          status: 429,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = mount();

    setInput(el, 'input[name="address"]', 'me@fastmail.com');
    setInput(el, 'input[name="password"]', 'app-password-123');
    const mailCheckbox = el.querySelector<HTMLInputElement>('input[name="capability-mail"]')!;
    mailCheckbox.checked = true;
    mailCheckbox.dispatchEvent(new Event('change'));
    setInput(el, 'input[name="imapHost"]', 'imap.fastmail.com');
    setInput(el, 'input[name="imapPort"]', '993');
    await nextTick();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() => expect(el.textContent).toContain('Wait a few minutes'));
    app.unmount();
  });

  it('shows copy for a refused host', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'host_not_allowed', message: 'refused' } }), {
          status: 422,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { el, app } = mount();

    setInput(el, 'input[name="address"]', 'me@fastmail.com');
    setInput(el, 'input[name="password"]', 'app-password-123');
    const mailCheckbox = el.querySelector<HTMLInputElement>('input[name="capability-mail"]')!;
    mailCheckbox.checked = true;
    mailCheckbox.dispatchEvent(new Event('change'));
    setInput(el, 'input[name="imapHost"]', '10.0.0.5');
    setInput(el, 'input[name="imapPort"]', '993');
    await nextTick();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() => expect(el.textContent).toContain("isn't allowed"));
    app.unmount();
  });
});

describe('StandardsForm — reconnect mode', () => {
  it('asks only for the password, showing the existing address read-only', () => {
    const { el, app } = mount({
      mode: 'reconnect',
      reconnectAccount: { id: 'acc-1', address: 'me@fastmail.com', capabilities: ['mail'] },
    });

    expect(el.querySelector('input[name="address"]')).toBeNull();
    expect(el.textContent).toContain('me@fastmail.com');
    expect(el.querySelector('input[name="password"]')).not.toBeNull();
    expect(el.querySelector('select[name="preset"]')).toBeNull();
    expect(el.querySelector('input[name="imapHost"]')).toBeNull();
    expect(el.querySelector('input[name="capability-mail"]')).toBeNull();
    app.unmount();
  });

  it('submits the existing address and capabilities with only the new password', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account: {
            id: 'acc-1',
            provider: 'standards',
            address: 'me@fastmail.com',
            label: 'me@fastmail.com',
            colour: 'teal',
            capabilities: ['mail'],
            grantedScopes: [],
            status: 'connected',
            pausedAt: null,
            lastRefreshAt: null,
            lastError: null,
            calendars: [],
          },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { el, app } = mount({
      mode: 'reconnect',
      reconnectAccount: { id: 'acc-1', address: 'me@fastmail.com', capabilities: ['mail'] },
    });

    setInput(el, 'input[name="password"]', 'new-app-password');
    await nextTick();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/connections/standards', expect.anything()),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      address: 'me@fastmail.com',
      password: 'new-app-password',
      capabilities: ['mail'],
    });
    app.unmount();
  });
});
