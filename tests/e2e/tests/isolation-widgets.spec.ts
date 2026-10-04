import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify } from '../fixtures/index.js';

/**
 * T062 (ci): browser-level complement to the ownership matrix — two users with a weather widget
 * on the same rounded place (one shared reading) and different currency widgets; neither
 * user's page, API payload or export shows anything of the other's (SC-003 / FR-016).
 * Uses the real API against the Open-Meteo mock; relies on the widgets.* flags being on in the
 * ci stack (ENABLE_PANELS_FLAGS); panels.today is switched on per user.
 */

const PASSWORD = 'xk-e2e-Tr0ub4-fixture-2026';
const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === '__Host-desk_csrf')?.value;
  if (!csrf) throw new Error('csrfHeaders: no __Host-desk_csrf cookie yet — visit a page first');
  return { 'x-csrf-token': csrf };
}

type Candidate = Record<string, unknown>;
type Widget = {
  id: string;
  kind: string;
  settings: { currencies?: string[] };
  asOf: string;
  figures?: { observedAt?: string; place?: string };
};
type WidgetsBody = { widgets: Widget[]; temperatureUnit: string };

function todayOn(email: string): void {
  execSync(`pnpm --filter @desk/db flags set panels.today --user "${email}" on`, {
    env: {
      ...process.env,
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgres://desk:desk@localhost:5432/desk',
    },
    stdio: 'pipe',
  });
}

async function setup(page: Page, codes: string[]): Promise<Widget[]> {
  const h = await csrfHeaders(page);
  const search = await page.request.get('/places/search?q=Manchester');
  expect(search.status()).toBe(200);
  const place = ((await search.json()) as { candidates: Candidate[] }).candidates[0]!;
  const w = await page.request.post('/widgets', {
    headers: h,
    data: { kind: 'weather', place },
  });
  expect(w.status(), await w.text()).toBe(201);
  const c = await page.request.post('/widgets', {
    headers: h,
    data: { kind: 'currency', settings: { currencies: codes } },
  });
  expect(c.status(), await c.text()).toBe(201);
  const list = (await (await page.request.get('/widgets')).json()) as WidgetsBody;
  return list.widgets;
}

/** Everything the page renders on /, /settings and /today (or the redirect) plus the export. */
async function surfaces(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const path of ['/', '/settings']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    out.push(await page.locator('body').innerText());
  }
  await page.goto('/today');
  await page.waitForLoadState('networkidle');
  out.push(await page.locator('body').innerText());
  out.push(await (await page.request.get('/me/export')).text());
  out.push(await (await page.request.get('/widgets')).text());
  return out;
}

test("user B never sees user A's widgets, place or currency codes, and vice versa", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const emailA = uniqueEmail('iso-widgets-a');
  const emailB = uniqueEmail('iso-widgets-b');
  await signUpAndVerify(a, emailA, PASSWORD);
  await signUpAndVerify(b, emailB, PASSWORD);
  todayOn(emailA);
  todayOn(emailB);
  // Set each user's temperature unit apart so it can't leak unnoticed.
  await a.request.patch('/me', { headers: await csrfHeaders(a), data: { temperatureUnit: 'F' } });

  const widgetsA = await setup(a, ['EUR', 'GBP']);
  const widgetsB = await setup(b, ['JPY', 'CHF']);
  expect(widgetsA.map((w) => w.kind).sort()).toEqual(['currency', 'weather']);
  expect(widgetsB).toHaveLength(2);

  const idsA = widgetsA.map((w) => w.id);
  const idsB = widgetsB.map((w) => w.id);
  expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);

  // Same rounded place, same cache: both see the same reading time.
  const obs = (ws: Widget[]) => ws.find((w) => w.kind === 'weather')!.figures?.observedAt;
  expect(obs(widgetsA)).toBeTruthy();
  expect(obs(widgetsA)).toBe(obs(widgetsB));

  const unitB = ((await (await b.request.get('/widgets')).json()) as WidgetsBody).temperatureUnit;
  expect(unitB).toBe('C');

  const seenByB = (await surfaces(b)).join('\n');
  const seenByA = (await surfaces(a)).join('\n');
  for (const id of idsA) expect(seenByB).not.toContain(id);
  for (const id of idsB) expect(seenByA).not.toContain(id);
  expect(seenByB).not.toMatch(/\bEUR\b|\bGBP\b/);
  expect(seenByA).not.toMatch(/\bJPY\b|\bCHF\b/);
  expect(seenByB).not.toContain('"temperatureUnit":"F"');

  // Foreign ids answer 404 and change nothing.
  const foreign = widgetsA.find((w) => w.kind === 'currency')!.id;
  const patch = await b.request.patch(`/widgets/${foreign}`, {
    headers: await csrfHeaders(b),
    data: { settings: { currencies: ['CAD'] } },
  });
  expect(patch.status()).toBe(404);
  const del = await b.request.delete(`/widgets/${foreign}`, { headers: await csrfHeaders(b) });
  expect(del.status()).toBe(404);
  const still = (await (await a.request.get('/widgets')).json()) as WidgetsBody;
  expect(still.widgets.map((w) => w.id).sort()).toEqual([...idsA].sort());

  await ctxA.close();
  await ctxB.close();
});
