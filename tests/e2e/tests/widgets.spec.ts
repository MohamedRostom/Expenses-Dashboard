import { expect, test, type Page, type Route } from '@playwright/test';
import {
  axeCheck,
  csrfHeaders,
  enableWidgetFlags,
  mockOpenMeteo,
  psql,
  signUpAndVerify,
} from '../fixtures/index.js';

// Not a real phrase, see tests/e2e/fixtures/index.ts's signUpAndVerify comment.
const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

/**
 * T011 (ci, foundational): the widget strip on the month view. The widgets API answers are
 * route-mocked so the states under test (empty, loading, unavailable, slow) are deterministic and
 * independent of the widgets.* flags; the real routes are covered by apps/api/test/widgets.test.ts.
 * Not run in the session that wrote it: the API routes land in a parallel batch.
 */

const TYPES = {
  types: [
    {
      kind: 'currency',
      name: 'Currency',
      description: 'Exchange rates against your default currency.',
      enabled: true,
      needsPlace: false,
      settingsSchema: {},
    },
    {
      kind: 'spend_pace',
      name: 'Spend pace',
      description: 'How this month is going against your budget.',
      enabled: true,
      needsPlace: false,
      settingsSchema: {},
    },
  ],
};

const widget = (state: string, over: Record<string, unknown> = {}) => ({
  id: 'w1',
  kind: 'spend_pace',
  position: 0,
  settings: {},
  state,
  asOf: new Date().toISOString(),
  ...over,
});

const list = (widgets: unknown[]) => ({ widgets, limit: 8, temperatureUnit: 'C' });

async function mockWidgets(
  page: Page,
  handler: (route: Route) => Promise<void> | void,
): Promise<void> {
  await page.route('**/widgets/types', (route) => route.fulfill({ json: TYPES }));
  await page.route(/\/widgets$/, (route) =>
    route.request().method() === 'GET' ? handler(route) : route.fallback(),
  );
}

async function addExpense(page: Page, description: string): Promise<void> {
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/description/i).fill(description);
  await page.getByLabel(/^amount$/i).fill('12');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^add expense$/i })
    .click();
  await expect(page.getByText(description)).toBeVisible();
}

test('the month view renders its expenses before the strip appears', async ({ page }) => {
  await mockWidgets(page, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ json: list([]) });
  });
  await signUpAndVerify(page, uniqueEmail('widgets-order'), PASSWORD);
  await expect(page).toHaveURL('/');
  await addExpense(page, 'Strip order');
  await page.reload();

  await expect(page.getByText('Strip order')).toBeVisible();
  await expect(page.getByText('No widgets yet')).toBeHidden();
  await expect(page.getByText('No widgets yet')).toBeVisible({ timeout: 10_000 });
});

test('with no widgets the strip explains widgets and offers the enabled kinds', async ({
  page,
}) => {
  await mockWidgets(page, (route) => route.fulfill({ json: list([]) }));
  await signUpAndVerify(page, uniqueEmail('widgets-empty'), PASSWORD);
  await addExpense(page, 'Empty strip');

  const strip = page.getByTestId('widget-strip');
  await expect(strip.getByText(/widgets show small, read-only figures/i)).toBeVisible();
  await expect(strip.getByText(/Currency, Spend pace/)).toBeVisible();
  await axeCheck(page);
});

test('add widget lists each kind with a description and a preview', async ({ page }) => {
  await mockWidgets(page, (route) => route.fulfill({ json: list([]) }));
  await signUpAndVerify(page, uniqueEmail('widgets-add'), PASSWORD);
  await addExpense(page, 'Add sheet');

  await page.getByTestId('add-widget').click();
  const dialog = page.getByRole('dialog', { name: /add widget/i });
  for (const t of TYPES.types) {
    await expect(dialog.getByText(t.name, { exact: true })).toBeVisible();
    await expect(dialog.getByText(t.description)).toBeVisible();
  }
  await expect(dialog.getByLabel('Example')).toHaveCount(TYPES.types.length);
});

test('a widget with no figures holds a fixed-height frame and nothing below moves', async ({
  page,
}) => {
  let calls = 0;
  await mockWidgets(page, (route) => {
    calls += 1;
    return route.fulfill({
      json: list([
        calls === 1
          ? widget('empty')
          : widget('ready', {
              figures: {
                spentMinor: 1200,
                budgetMinor: null,
                pct: null,
                daysLeft: 20,
                dailyToBudgetMinor: null,
                overBudget: false,
              },
            }),
      ]),
    });
  });
  await signUpAndVerify(page, uniqueEmail('widgets-shift'), PASSWORD);
  await addExpense(page, 'No shift');

  const frame = page.getByTestId('widget-frame');
  await expect(frame).toBeVisible();
  const table = page.locator('.desk-entries-table');
  await expect(table).toBeVisible();
  const before = { frame: await frame.boundingBox(), table: await table.boundingBox() };

  // The store reloads when the tab becomes visible again.
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await expect(frame).toHaveAttribute('data-state', 'ready');
  const after = { frame: await frame.boundingBox(), table: await table.boundingBox() };

  expect(after.frame?.height).toBe(before.frame?.height);
  expect(after.table?.y).toBe(before.table?.y);
});

for (const [name, size] of [
  ['mobile', { width: 360, height: 740 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`axe: loading and unavailable states at ${name} width`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockWidgets(page, (route) =>
      route.fulfill({
        json: list([
          widget('empty', { id: 'w1' }),
          widget('unavailable', { id: 'w2', kind: 'currency' }),
        ]),
      }),
    );
    await signUpAndVerify(page, uniqueEmail(`widgets-axe-${name}`), PASSWORD);
    await addExpense(page, 'Axe frames');

    await expect(page.getByTestId('widget-frame')).toHaveCount(2);
    await expect(page.getByText(/unavailable right now/i)).toBeVisible();
    await axeCheck(page);
  });
}

/**
 * T026 (ci, currency, US1). Every answer is route-mocked (/widgets, /widgets/types, /currencies),
 * so these prove what the strip renders for the payloads the API contract allows, not the live
 * rates: rate maths, the Friday fallback, default-currency re-derivation and the failing range
 * endpoint are asserted against the real routes in apps/api/test/widgets.test.ts. There is no
 * freezeClock fixture yet, so the Saturday case mocks the Friday rateDate the server would send.
 * Written, not run, in the session that wrote it.
 */
const CODES = ['GBP', 'EUR', 'USD', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const CURRENCIES = {
  currencies: CODES.map((code) => ({ code, name: `${code} name`, exponent: 2 })),
};

const eurRow = {
  code: 'EUR',
  rate: 1.1634,
  rateDate: '2026-10-02',
  prevChange: { pct: 0.4, direction: 'up' },
  monthChange: { pct: 1.2, direction: 'down', since: '2026-09-02' },
};

const currencyWidget = (rows: unknown[], over: Record<string, unknown> = {}) =>
  widget('ready', {
    kind: 'currency',
    settings: { currencies: rows.map((r) => (r as { code: string }).code) },
    figures: { rows },
    ...over,
  });

async function openCurrencyScene(
  page: Page,
  tag: string,
  widgets: () => unknown[],
  size = { width: 1280, height: 800 },
): Promise<void> {
  await page.setViewportSize(size);
  await page.route('**/currencies', (route) => route.fulfill({ json: CURRENCIES }));
  await mockWidgets(page, (route) => route.fulfill({ json: list(widgets()) }));
  await signUpAndVerify(page, uniqueEmail(tag), PASSWORD);
  await addExpense(page, `Currency ${tag}`);
}

test('adding a currency widget shows rate, date and both changes with direction', async ({
  page,
}) => {
  let widgets: unknown[] = [];
  await page.route('**/widgets', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    widgets = [currencyWidget([eurRow])];
    return route.fulfill({ status: 201, json: { widget: widgets[0] } });
  });
  await openCurrencyScene(page, 'cur-add', () => widgets);

  await page.getByTestId('add-widget').click();
  await page
    .getByRole('dialog', { name: /add widget/i })
    .getByRole('listitem')
    .filter({ hasText: 'Currency' })
    .getByRole('button', { name: 'Add' })
    .click();
  // Currency now asks which codes first (the Add sheet's configure step).
  const sheet = page.getByRole('dialog', { name: /add widget/i });
  await sheet.getByRole('checkbox', { name: /EUR/ }).check();
  await sheet.getByRole('button', { name: 'Add widget' }).click();

  const frame = page.getByTestId('widget-frame');
  await expect(frame).toContainText('EUR', { timeout: 1000 });
  await expect(frame).toContainText('1.1634');
  await expect(frame).toContainText('2026-10-02');
  await expect(frame).toContainText('up 0.4%');
  await expect(frame).toContainText('down 1.2%');
  await expect(frame).toContainText('since 2026-09-02');
});

test('on a weekend the widget names the Friday the rate is from', async ({ page }) => {
  await openCurrencyScene(page, 'cur-sat', () => [
    currencyWidget([{ ...eurRow, rateDate: '2026-10-02' }]), // 2 Oct 2026 is a Friday
  ]);
  await expect(page.getByTestId('widget-frame')).toContainText('2026-10-02');
});

test('the default currency row has no figures', async ({ page }) => {
  await openCurrencyScene(page, 'cur-default', () => [
    currencyWidget([
      { code: 'EUR', isDefault: true },
      { ...eurRow, code: 'USD' },
    ]),
  ]);
  const frame = page.getByTestId('widget-frame');
  await expect(frame.getByText('your default currency')).toBeVisible();
  await expect(frame.getByText('EUR').locator('..')).not.toContainText(/\d\.\d/);
});

test('a failing range endpoint reads "not available yet" with no error banner', async ({
  page,
}) => {
  await openCurrencyScene(page, 'cur-pending', () => [
    currencyWidget([{ ...eurRow, prevChange: null, monthChange: null, changesPending: true }]),
  ]);
  const frame = page.getByTestId('widget-frame');
  await expect(frame.getByText('not available yet')).toHaveCount(2);
  await expect(frame.getByRole('alert')).toHaveCount(0);
  await expect(frame).toHaveAttribute('data-state', 'ready');
});

test('settings refuse the default currency and a seventh code with a message', async ({ page }) => {
  const six = ['EUR', 'USD', 'JPY', 'CHF', 'CAD', 'AUD'];
  await page.route(/\/widgets\/w1$/, (route) => route.fulfill({ json: { widget: {} } }));
  await openCurrencyScene(page, 'cur-cap', () => [
    currencyWidget(six.map((code) => ({ ...eurRow, code }))),
  ]);
  await page.getByLabel(/currency menu/i).click();
  await page.getByRole('button', { name: 'Settings' }).click();

  const dialog = page.getByRole('dialog', { name: /widget settings/i });
  await expect(dialog.getByRole('checkbox', { name: /^GBP/ })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: /^NZD/ })).toBeDisabled();
  await expect(dialog.getByText(/up to six currencies/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /add a second currency widget/i })).toBeVisible();
});

for (const [name, size] of [
  ['mobile', { width: 360, height: 740 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  for (const [state, over] of [
    ['ready', {}],
    ['stale', { state: 'stale', cause: 'source_unreachable' }],
    ['error', { state: 'error', cause: 'rate_unavailable', figures: undefined }],
  ] as const) {
    test(`axe: currency ${state} at ${name} width`, async ({ page }) => {
      await openCurrencyScene(
        page,
        `cur-axe-${state}-${name}`,
        () => [currencyWidget([eurRow], over)],
        size,
      );
      await expect(page.getByTestId('widget-frame')).toHaveAttribute('data-state', state);
      await axeCheck(page);
    });
  }
}

/**
 * Real-stack specs (no route mocks) for spec 003: T036 weather, T050 arrange, T056 spend pace,
 * fixed costs and sunrise. They run against the compose stack with the Open-Meteo mock, so each
 * test makes its own user and, where it reads weather, its own place at random coordinates (the
 * API caches searches and shares readings per rounded coordinate across users). The mock's
 * pause/fail/polar controls are process-wide, so everything that touches weather lives in ONE
 * serial describe (one worker) and resets them in `finally`.
 */
test.beforeAll(() => enableWidgetFlags());

type Me = { user: { defaultCurrency: string; timeZone: string } };
type ApiWidget = {
  id: string;
  kind: string;
  state: string;
  settings: unknown;
  figures?: Record<string, unknown>;
};

const rnd = (n: number) => Math.floor(Math.random() * n);
const letters = (n: number) =>
  Array.from({ length: n }, () => 'abcdefghijklmnop'[rnd(16)]).join('');

/** A place only this test knows: searchable by its unique name, at coordinates nobody else uses. */
function uniquePlace(timeZone = 'Europe/London') {
  return {
    name: `Zq${letters(8)}`,
    admin1: 'Testshire',
    country: 'Testland',
    lat: 10 + rnd(7000) / 100,
    lon: -170 + rnd(34000) / 100,
    timeZone,
  };
}

async function signedIn(page: Page, tag: string): Promise<string> {
  const email = uniqueEmail(tag);
  await signUpAndVerify(page, email, PASSWORD);
  await expect(page).toHaveURL('/');
  return email;
}

async function apiJson<T>(
  page: Page,
  method: 'get' | 'post' | 'patch' | 'put',
  path: string,
  data?: unknown,
): Promise<T> {
  const res = await page.request.fetch(path, {
    method,
    ...(data !== undefined && { data }),
    headers: await csrfHeaders(page),
  });
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

const me = (page: Page) => apiJson<Me>(page, 'get', '/me');
const widgetsOf = async (page: Page) =>
  (await apiJson<{ widgets: ApiWidget[] }>(page, 'get', '/widgets')).widgets;

const frame = (page: Page, title: string) => page.getByRole('article', { name: title }).first();
const titles = (page: Page) => page.getByTestId('widget-title').allInnerTexts();

async function addWidget(page: Page, name: string): Promise<void> {
  await page.getByTestId('add-widget').click();
  const dialog = page.getByRole('dialog', { name: /add widget/i });
  await dialog
    .getByRole('listitem')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Add' })
    .click();
  // The sheet closes itself once the widget is added; reopening it earlier would be closed by that.
  await expect(dialog).toBeHidden();
}

async function openSettings(page: Page, title: string) {
  const settings = frame(page, title).getByRole('button', { name: 'Settings' });
  // The menu is a <details>: it stays open after a sheet closes, and a second click would shut it.
  if (!(await settings.isVisible())) await frame(page, title).getByLabel(`${title} menu`).click();
  await settings.click();
  return page.getByRole('dialog', { name: /widget settings/i });
}

/**
 * Creates a weather widget at `place` through the API. The Add sheet cannot do this itself: it
 * posts { kind } with no place and the API answers 422 "weather needs a place" (reported as a
 * product bug), so the widget is created here and then driven through its settings.
 */
async function addWeatherAt(page: Page, place: ReturnType<typeof uniquePlace>): Promise<void> {
  await mockOpenMeteo().addPlace(place);
  await apiJson(page, 'post', '/widgets', { kind: 'weather', place });
  await page.reload();
}

/** Points the weather widget at `place` with the settings picker, as a user would. */
async function pickPlace(page: Page, place: ReturnType<typeof uniquePlace>): Promise<void> {
  await mockOpenMeteo().addPlace(place);
  const dialog = await openSettings(page, 'Weather');
  await dialog.getByLabel('Search for a place').fill(place.name);
  await dialog.getByTestId('place-candidate').first().click();
  await page.keyboard.press('Escape');
}

const axeBoth = async (page: Page) => {
  for (const size of [
    { width: 360, height: 740 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await axeCheck(page);
  }
};

test.describe('weather and sunrise (shared mock state, serial)', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test('a short query sends nothing; "Manch" lists both Manchesters with region and country', async ({
    page,
  }) => {
    await signedIn(page, 'wx-search');
    await addWeatherAt(page, uniquePlace());
    const dialog = await openSettings(page, 'Weather');
    const before = await mockOpenMeteo().calls();

    await dialog.getByLabel('Search for a place').fill('Ma');
    await page.waitForTimeout(800); // longer than the 400 ms debounce
    expect((await mockOpenMeteo().calls()).search).toBe(before.search);

    await dialog.getByLabel('Search for a place').fill('Manch');
    const options = dialog.getByTestId('place-candidate');
    await expect(options).toHaveCount(2);
    await expect(options.filter({ hasText: /Manchester, England, United Kingdom/ })).toHaveCount(1);
    await expect(
      options.filter({ hasText: /Manchester, New Hampshire, United States/ }),
    ).toHaveCount(1);
  });

  test('choosing a place shows the reading in five seconds; °F converts and persists', async ({
    page,
  }) => {
    await signedIn(page, 'wx-ready');
    const place = uniquePlace();
    await mockOpenMeteo().setTemperature(place.lat, place.lon, 10);
    await addWeatherAt(page, uniquePlace());
    await pickPlace(page, place);

    const weather = frame(page, 'Weather');
    await expect(weather).toContainText('10°C', { timeout: 5000 });
    await expect(weather).toContainText(place.name);
    await expect(weather.getByRole('img').first()).toBeVisible(); // condition icon, labelled
    await expect(weather).toContainText(/H -?\d+° · L -?\d+°/);
    await expect(weather.getByTestId('outlook-day')).toHaveCount(3);
    await expect(weather).toContainText(/as of \d{2}:\d{2}/);
    const rangeC = (await weather.locator('.desk-weather-range').innerText())
      .match(/-?\d+/g)!
      .map(Number);
    await axeBoth(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    const dialog = await openSettings(page, 'Weather');
    await dialog.getByLabel('°F').check();
    await page.keyboard.press('Escape');
    const f = (c: number) => Math.round((c * 9) / 5 + 32);
    await expect(weather).toContainText('50°F');
    // The widget converts the unrounded Celsius, the test only saw it rounded: allow 1 degree.
    const rangeF = (await weather.locator('.desk-weather-range').innerText())
      .match(/-?\d+/g)!
      .map(Number);
    expect(Math.abs(rangeF[0]! - f(rangeC[0]!))).toBeLessThanOrEqual(1);
    expect(Math.abs(rangeF[1]! - f(rangeC[1]!))).toBeLessThanOrEqual(1);
    expect(rangeF[0]).toBeGreaterThan(rangeC[0]!);

    await page.reload();
    await expect(frame(page, 'Weather')).toContainText('50°F');
  });

  test('offline keeps the last reading visible with the offline line', async ({
    page,
    context,
  }) => {
    await signedIn(page, 'wx-offline');
    const place = uniquePlace();
    await mockOpenMeteo().setTemperature(place.lat, place.lon, 12);
    await addWeatherAt(page, place);
    await expect(frame(page, 'Weather')).toContainText('12°C', { timeout: 5000 });

    await context.setOffline(true);
    const weather = frame(page, 'Weather');
    await expect(weather).toContainText("You're offline — showing the last reading");
    await expect(weather).toContainText('12°C');
    await expect(weather).toContainText(/as of \d{2}:\d{2}/);
    await axeBoth(page);
    await context.setOffline(false);
  });

  test('geolocation: the button says it asks once, offers "near <city>", and only the confirmed place reaches Settings', async ({
    page,
    context,
  }) => {
    await signedIn(page, 'wx-geo');
    const place = uniquePlace();
    await mockOpenMeteo().addPlace(place);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: place.lat, longitude: place.lon });
    await addWeatherAt(page, uniquePlace());
    const dialog = await openSettings(page, 'Weather');

    const button = dialog.getByTestId('use-location');
    await expect(button).toContainText(/we will ask your device once/i);
    // A search first, so the geocode cache knows a place at these coordinates.
    await dialog.getByLabel('Search for a place').fill(place.name);
    await expect(dialog.getByTestId('place-candidate')).toHaveCount(1);
    await button.click();
    await expect(dialog.getByText(`Near ${place.name}`)).toBeVisible();
    await dialog.getByTestId('place-candidate').first().click();
    await page.keyboard.press('Escape');

    await page.goto('/settings');
    await expect(page.getByTestId('widget-place')).toHaveText([place.name]);
  });

  test('with location denied the typed search still works and nothing blocks', async ({
    page,
    context,
  }) => {
    await signedIn(page, 'wx-denied');
    const place = uniquePlace();
    await mockOpenMeteo().addPlace(place);
    await context.clearPermissions();
    await addWeatherAt(page, uniquePlace());
    const dialog = await openSettings(page, 'Weather');

    await dialog.getByTestId('use-location').click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByLabel('Search for a place').fill(place.name);
    await expect(dialog.getByTestId('place-candidate')).toHaveCount(1);
    await dialog.getByTestId('place-candidate').first().click();
    await page.keyboard.press('Escape');
    await expect(frame(page, 'Weather')).toContainText(/\d+°C/, { timeout: 5000 });
  });

  test('removing the widget removes the place from Settings and from the export', async ({
    page,
  }) => {
    await signedIn(page, 'wx-remove');
    const place = uniquePlace();
    await addWeatherAt(page, place);
    await expect(frame(page, 'Weather')).toContainText(place.name, { timeout: 5000 });

    await page.goto('/settings');
    await expect(page.getByTestId('widget-place')).toHaveText([place.name]);
    expect(await (await page.request.get('/me/export')).text()).toContain(place.name);

    await page.goto('/');
    page.once('dialog', (d) => void d.accept());
    await frame(page, 'Weather').getByLabel('Weather menu').click();
    await frame(page, 'Weather').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('article', { name: 'Weather' })).toHaveCount(0);

    await page.goto('/settings');
    await expect(page.getByTestId('widget-place')).toHaveCount(0);
    expect(await (await page.request.get('/me/export')).text()).not.toContain(place.name);
  });

  test('sunrise: times and day length for the weather place; the zone shows only when it differs', async ({
    page,
  }) => {
    await signedIn(page, 'sun-zone');
    const { user } = await me(page);
    const same = uniquePlace(user.timeZone);
    await addWeatherAt(page, same);
    await expect(frame(page, 'Weather')).toContainText(/\d+°C/, { timeout: 5000 });
    await addWidget(page, 'Sunrise and sunset');

    const sun = frame(page, 'Sunrise and sunset');
    await expect(sun).toContainText(/Sunrise \d{2}:\d{2}/, { timeout: 5000 });
    await expect(sun).toContainText(/Sunset \d{2}:\d{2}/);
    await expect(sun).toContainText(/Day length \d+ h/);
    await expect(sun).not.toContainText(user.timeZone);
    await axeBoth(page);

    // A sunrise widget for a place in another zone shows that zone.
    const other = uniquePlace(
      user.timeZone === 'Pacific/Auckland' ? 'Europe/Paris' : 'Pacific/Auckland',
    );
    await mockOpenMeteo().addPlace(other);
    const sunriseId = (await widgetsOf(page)).find((w) => w.kind === 'sunrise')!.id;
    await apiJson(page, 'patch', `/widgets/${sunriseId}`, { place: other });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(frame(page, 'Sunrise and sunset')).toContainText(other.timeZone, {
      timeout: 5000,
    });
  });

  test('polar night reads "Sun down all day", 0 h, no times and no error banner', async ({
    page,
  }) => {
    await signedIn(page, 'sun-polar');
    const place = uniquePlace('Arctic/Longyearbyen');
    const mock = mockOpenMeteo();
    try {
      await mock.usePolar('night');
      await addWeatherAt(page, place);
      await expect(frame(page, 'Weather')).toContainText(/\d+°C/, { timeout: 5000 });
    } finally {
      await mock.usePolar(null);
    }
    await addWidget(page, 'Sunrise and sunset');
    const sun = frame(page, 'Sunrise and sunset');
    await expect(sun).toContainText('Sun down all day', { timeout: 5000 });
    await expect(sun).toContainText('Day length 0 h');
    await expect(sun).not.toContainText(/Sunrise \d/);
    await expect(sun.getByRole('alert')).toHaveCount(0);
    await expect(sun).toHaveAttribute('data-state', 'ready');
    await axeBoth(page);
  });

  test('a paused source makes the widget stale ("limit reached") and search say "try again later"', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signedIn(page, 'wx-paused');
    const place = uniquePlace();
    await addWeatherAt(page, place);
    await expect(frame(page, 'Weather')).toContainText(/\d+°C/, { timeout: 5000 });

    const mock = mockOpenMeteo();
    const pauseFlag = () =>
      psql("select value from flags where key = 'widgets.weather_paused_until'").trim();
    try {
      // The refresh job (every minute) finds the reading due, meets a 429 and pauses the source.
      await mock.pauseSource(150_000);
      psql(
        `update weather_readings set fetched_at = now() - interval '2 hours' where lat = ${place.lat} and lon = ${place.lon}`,
      );
      await expect.poll(pauseFlag, { timeout: 120_000, intervals: [2000] }).not.toBe('');

      await page.reload();
      const weather = frame(page, 'Weather');
      await expect(weather).toHaveAttribute('data-state', 'stale');
      await expect(weather).toContainText('daily limit is reached');
      await expect(weather).toContainText(/\d+°C/); // the last reading stays
      await axeBoth(page);

      await page.setViewportSize({ width: 1280, height: 800 });
      const dialog = await openSettings(page, 'Weather');
      await dialog.getByLabel('Search for a place').fill(`Qx${letters(6)}`);
      await expect(dialog.getByText(/try again later/i)).toBeVisible();
    } finally {
      await mock.pauseSource(0);
      psql("update flags set value = null where key = 'widgets.weather_paused_until'");
    }
  });
});

/** Seeds a month through the API: budgets on Internet (fixed) and Groceries, one grocery expense. */
async function seedMonth(page: Page) {
  const { user } = await me(page);
  const { categories } = await apiJson<{
    categories: { id: string; name: string; defaultKind: string | null }[];
  }>(page, 'get', '/categories');
  const byName = (n: string) => categories.find((c) => c.name === n)!;
  await apiJson(page, 'patch', `/categories/${byName('Internet').id}`, { budgetMinor: 3000 });
  await apiJson(page, 'patch', `/categories/${byName('Groceries').id}`, { budgetMinor: 20000 });
  const expense = (categoryName: string, minor: number, date: string, kind: string) =>
    apiJson(page, 'post', '/expenses', {
      description: `${categoryName} ${minor}`,
      amount: { minor, currency: user.defaultCurrency },
      date,
      categoryId: byName(categoryName).id,
      paidWith: 'card',
      kind,
    });
  const today = new Date().toISOString().slice(0, 10);
  await expense('Groceries', 4500, today, 'variable');
  return { expense, today };
}

test.describe('arrange (US3)', () => {
  test('drag reorders and survives reload; keyboard move announces; duplicate copies; menus show only their own options', async ({
    page,
  }) => {
    await signedIn(page, 'arr');
    await page.setViewportSize({ width: 1280, height: 800 });
    await addWidget(page, 'Spend pace');
    await addWidget(page, 'Fixed costs');
    // Not through the Add sheet: it posts { kind } with no currencies and the API answers 422
    // (reported as a product bug, same as weather).
    await apiJson(page, 'post', '/widgets', {
      kind: 'currency',
      settings: { currencies: ['EUR', 'JPY'] },
    });
    await page.reload();
    await expect.poll(() => titles(page)).toEqual(['Spend pace', 'Fixed costs', 'Currency']);

    // Pointer drag: the first frame's grip onto the third frame.
    const grip = page.getByTestId('widget-grip').first();
    const target = (await frame(page, 'Currency').boundingBox())!;
    const from = (await grip.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    await expect.poll(() => titles(page)).toEqual(['Fixed costs', 'Currency', 'Spend pace']);
    await page.reload();
    await expect.poll(() => titles(page)).toEqual(['Fixed costs', 'Currency', 'Spend pace']);

    // Keyboard only: open the menu, focus "Move up", press Enter.
    await frame(page, 'Spend pace').getByLabel('Spend pace menu').focus();
    await page.keyboard.press('Enter');
    await frame(page, 'Spend pace').getByRole('button', { name: 'Move up' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('widget-live')).toContainText(
      'Spend pace moved to position 2 of 3',
    );
    await expect.poll(() => titles(page)).toEqual(['Fixed costs', 'Spend pace', 'Currency']);

    // Duplicate appends a copy with the same settings.
    const before = await widgetsOf(page);
    await frame(page, 'Currency').getByLabel('Currency menu').click();
    await frame(page, 'Currency').getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.getByTestId('widget-frame')).toHaveCount(4);
    const src = before.find((w) => w.kind === 'currency')!;
    expect((await widgetsOf(page)).at(-1)).toMatchObject({
      kind: 'currency',
      settings: src.settings,
    });

    // Settings show only the widget's own options.
    let dialog = await openSettings(page, 'Currency');
    await expect(dialog.getByText(/Currencies \(up to six\)/)).toBeVisible();
    await expect(dialog.getByLabel('Search for a place')).toHaveCount(0);
    await expect(dialog.getByText('Temperature unit')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await addWeatherAt(page, uniquePlace());
    dialog = await openSettings(page, 'Weather');
    await expect(dialog.getByLabel('Search for a place')).toBeVisible();
    await expect(dialog.getByText('Temperature unit')).toBeVisible();
    await expect(dialog.getByText(/Currencies \(up to six\)/)).toHaveCount(0);
  });

  test('at eight widgets the add control is disabled and shows the limit', async ({ page }) => {
    await signedIn(page, 'arr-limit');
    for (let i = 0; i < 8; i++) await apiJson(page, 'post', '/widgets', { kind: 'spend_pace' });
    await page.reload();
    const add = page.getByTestId('add-widget');
    await expect(add).toBeDisabled();
    await expect(add).toContainText('8 of 8');
  });

  test('on a phone the same order stacks in one column with no horizontal scroll; a second tab sees the new order', async ({
    page,
    context,
  }) => {
    await signedIn(page, 'arr-phone');
    await page.setViewportSize({ width: 1280, height: 800 });
    await addWidget(page, 'Spend pace');
    await addWidget(page, 'Fixed costs');
    await frame(page, 'Fixed costs').getByLabel('Fixed costs menu').click();
    await frame(page, 'Fixed costs').getByRole('button', { name: 'Move up' }).click();
    await expect.poll(() => titles(page)).toEqual(['Fixed costs', 'Spend pace']);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.reload();
    await expect.poll(() => titles(page)).toEqual(['Fixed costs', 'Spend pace']);
    const xs = await page
      .getByTestId('widget-frame')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(new Set(xs).size).toBe(1);
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
      true,
    );

    const second = await context.newPage();
    await second.goto('/');
    await expect
      .poll(() => second.getByTestId('widget-title').allInnerTexts())
      .toEqual(['Fixed costs', 'Spend pace']);
  });
});

test.describe('expense widgets (US4)', () => {
  test('spend pace equals the month tiles and turns critical on a large expense; fixed costs list Internet', async ({
    page,
  }) => {
    await signedIn(page, 'exp');
    const { expense, today } = await seedMonth(page);
    await page.reload();
    await addWidget(page, 'Spend pace');
    await addWidget(page, 'Fixed costs');
    const calls = await mockOpenMeteo().calls();

    const pace = frame(page, 'Spend pace');
    const tile = (label: string) =>
      page.locator('.desk-tile', { hasText: label }).locator('.desk-tile-value');
    await expect(pace).toContainText(await tile('Spent').innerText(), { timeout: 5000 });
    await expect(pace).toContainText(`of ${await tile('Budget').innerText()}`);
    await expect(pace).toContainText(/\d+% · \d+ days? left/);
    await expect(pace).toContainText('a day to stay on budget');
    const colour = () =>
      frame(page, 'Spend pace')
        .locator('.desk-spend-pace-num')
        .first()
        .evaluate(
          (e) =>
            (
              e.ownerDocument.defaultView as { getComputedStyle(e: unknown): { color: string } }
            ).getComputedStyle(e).color,
        );
    const before = await colour();

    // Fixed costs: Internet shows its budget (a budget wins over history, so no "about"); Phone has
    // no budget, so it reads "about" once last month has a bill.
    await expect(frame(page, 'Fixed costs')).toContainText('Internet');
    await expect(frame(page, 'Fixed costs')).not.toContainText('about');
    const lastMonth = new Date();
    lastMonth.setUTCDate(15);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await expense('Phone', 1500, lastMonth.toISOString().slice(0, 10), 'fixed');
    await page.reload();
    await expect(frame(page, 'Fixed costs')).toContainText(/Phone\s*about \$15\.00/);

    // A large expense: spend pace follows the tile and turns critical.
    await expense('Groceries', 90000, today, 'variable');
    await page.reload();
    await expect(frame(page, 'Spend pace')).toContainText(await tile('Spent').innerText());
    await expect(frame(page, 'Spend pace').locator('.desk-over')).toBeVisible();
    expect(await colour()).not.toBe(before);
    expect(await mockOpenMeteo().calls()).toEqual(calls); // no external call for these widgets
    await axeBoth(page);
  });

  test('with no budget the spend pace widget offers to set one', async ({ page }) => {
    await signedIn(page, 'exp-nobudget');
    await addWidget(page, 'Spend pace');
    const pace = frame(page, 'Spend pace');
    await expect(pace).toContainText('No budget set', { timeout: 5000 });
    await expect(pace.getByRole('link', { name: /set a budget/i })).toHaveAttribute(
      'href',
      '/categories',
    );
    await axeBoth(page);
  });
});

test('currency and weather widgets can be added through the Add sheet alone', async ({ page }) => {
  await signedIn(page, 'add-sheet');
  const dialog = page.getByRole('dialog', { name: /add widget/i });
  const addButton = (name: string) =>
    dialog.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'Add' });

  await page.getByTestId('add-widget').click();
  await addButton('Currency').click();
  await dialog.getByRole('checkbox', { name: /EUR/ }).check();
  await dialog.getByRole('button', { name: 'Add widget' }).click();
  await expect(dialog).toBeHidden();
  // The ci stack's FakeRates has fixtures for fixed past dates only, so today's rate cannot render
  // here; the widget existing with the chosen code proves the Add sheet sent the right body.
  await expect(frame(page, 'Currency')).toBeVisible();
  expect((await widgetsOf(page)).map((w) => w.settings)).toContainEqual({ currencies: ['EUR'] });

  await page.getByTestId('add-widget').click();
  await addButton('Weather').click();
  await dialog.getByLabel('Search for a place').fill('Manch');
  await dialog.getByTestId('place-candidate').first().click();
  await expect(dialog).toBeHidden();
  await expect(frame(page, 'Weather')).toContainText('°C', { timeout: 10_000 });
});
