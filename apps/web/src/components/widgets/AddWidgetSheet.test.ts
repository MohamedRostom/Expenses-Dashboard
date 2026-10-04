import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetCreateT, WidgetTypeT } from '@desk/contracts';
import type { PanelErrorKind } from '../../utils/errors.js';

vi.mock('../../api/client.js', async (orig: () => Promise<Record<string, unknown>>) => ({
  ...(await orig()),
  apiFetch: vi.fn(async () => ({
    currencies: [
      { code: 'GBP', name: 'Pound' },
      { code: 'EUR', name: 'Euro' },
      { code: 'USD', name: 'Dollar' },
    ],
  })),
}));
vi.mock('../../api/places.js', () => ({
  searchPlaces: vi.fn(async () => ({
    candidates: [
      {
        name: 'Manchester',
        admin1: 'England',
        country: 'United Kingdom',
        lat: 53.48,
        lon: -2.24,
        timeZone: 'Europe/London',
      },
    ],
  })),
  resolvePlace: vi.fn(),
}));

const type = (kind: WidgetTypeT['kind']): WidgetTypeT => ({
  kind,
  name: kind,
  description: `${kind} description`,
  enabled: true,
  needsPlace: false,
  settingsSchema: {},
});
const TYPES = (['currency', 'weather', 'sunrise', 'spend_pace', 'fixed_costs'] as const).map(type);

const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

async function mount(
  add: (b: WidgetCreateT) => Promise<void>,
  hasWeather = false,
  types = TYPES,
  typesError: PanelErrorKind | null = null,
) {
  const { default: AddWidgetSheet } = await import('./AddWidgetSheet.vue');
  const { useSessionStore } = await import('../../stores/session.js');
  const pinia = createPinia();
  setActivePinia(pinia);
  (useSessionStore() as unknown as { user: unknown }).user = { defaultCurrency: 'GBP' };
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp({
    render: () =>
      h(AddWidgetSheet, { open: true, types, typesError, hasWeather, add, onClose: vi.fn() }),
  }).use(pinia);
  app.mount(el);
  await flush();
  return { app };
}

const body = () => document.body;
const button = (text: string) =>
  [...body().querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  );
const addFor = (name: string) =>
  [...body().querySelectorAll('li')]
    .find((l) => l.textContent?.includes(`${name} description`))!
    .querySelector('button')!;

describe('AddWidgetSheet', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => (document.body.innerHTML = ''));

  it('says so when no widget type is enabled, instead of an empty sheet', async () => {
    await mount(
      vi.fn(),
      false,
      TYPES.map((t) => ({ ...t, enabled: false })),
    );
    expect(body().querySelector('li')).toBeNull();
    expect(body().textContent).toContain('No widgets available yet');
  });

  it('a failed catalogue fetch shows the error by code, not "No widgets available yet"', async () => {
    await mount(vi.fn(), false, [], 'server_error');
    expect(body().textContent).toContain('Something went wrong');
    expect(body().textContent).not.toContain('No widgets available yet');
  });

  it('a 401 on the catalogue shows the sign-in prompt', async () => {
    await mount(vi.fn(), false, [], 'session_expired');
    expect(body().textContent).toContain('Session expired');
  });

  it('adds kinds that need nothing immediately', async () => {
    const add = vi.fn(async () => {});
    await mount(add);
    addFor('spend_pace').click();
    await flush();
    expect(add).toHaveBeenCalledWith({ kind: 'spend_pace' });
  });

  it('sunrise adds immediately when a weather widget exists', async () => {
    const add = vi.fn(async () => {});
    await mount(add, true);
    addFor('sunrise').click();
    await flush();
    expect(add).toHaveBeenCalledWith({ kind: 'sunrise' });
  });

  it('currency opens a picker, disables the default, and adds the chosen codes', async () => {
    const add = vi.fn(async () => {});
    await mount(add);
    addFor('currency').click();
    await flush();
    expect(add).not.toHaveBeenCalled();
    const boxes = [...body().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.find((b) => b.value === 'GBP')?.disabled).toBe(true);
    expect(body().textContent).toContain('your default currency');
    boxes.find((b) => b.value === 'EUR')!.click();
    await flush();
    button('Add widget')!.click();
    await flush();
    expect(add).toHaveBeenCalledWith({ kind: 'currency', settings: { currencies: ['EUR'] } });
  });

  it('weather opens the place picker and adds with the chosen place', async () => {
    const add = vi.fn(async () => {});
    await mount(add);
    addFor('weather').click();
    await flush();
    const input = body().querySelector<HTMLInputElement>(
      'input[type="search"], input[type="text"]',
    )!;
    input.value = 'Manch';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(button('Manchester, England, United Kingdom')).toBeTruthy());
    button('Manchester, England, United Kingdom')!.click();
    await flush();
    expect(add).toHaveBeenCalledWith({
      kind: 'weather',
      place: expect.objectContaining({ name: 'Manchester' }),
    });
  });

  it('shows the server message in an alert when adding fails', async () => {
    const { ApiError } = await import('../../api/client.js');
    const add = vi.fn(async () => {
      throw new ApiError('limit_reached', 'You can have 8 widgets.', 409);
    });
    await mount(add);
    addFor('spend_pace').click();
    await flush();
    expect(body().querySelector('[role="alert"]')?.textContent).toContain(
      'You can have 8 widgets.',
    );
  });
});
