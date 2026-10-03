import { sql } from 'drizzle-orm';
import { setGlobalFlag } from '@desk/db';
import type { MailSource } from '@desk/connectors/panels';
import { startHarness, type ApiClient, type Harness } from './harness.js';

/** T070: connect a standards account with the correct password every time — ownership isolation
 * is what this file tests, not verification failure paths (covered in connections.test.ts). */
const fakeStandardsMail: MailSource = {
  async fetchInbox() {
    return { messages: [], full: true };
  },
  async verify() {},
  async revoke() {},
};

/**
 * Ownership matrix (CLAUDE.md "Testing rules": every route x user A / user B must prove
 * isolation). Each row creates a resource as user B, then hits `path` (with user B's resource
 * id substituted) as user A, and expects not_found (404) — never user B's data.
 *
 * T036/T051: Phase 1 + Phase 2 id-addressed routes. Routes intentionally excluded because they
 * have no "someone else's" resource in the URL (self-operations or public/no-ownership-concept
 * routes):
 * GET /me, PATCH /me, GET /me/export, DELETE /me, GET /me/sessions — act on the caller only;
 * GET /currencies, GET /flags — no per-user id in the path;
 * POST /auth/*, GET /auth/google/* — public, pre-session;
 * DELETE /me/password, DELETE /me/oauth/:provider — act on the caller's own account, addressed
 * by provider name (not another user's resource id), so there is no "user B's" row to fetch.
 * GET /expenses, POST /expenses — scoped to the caller's own rows implicitly (no foreign id in
 * the path/body to substitute); GET /summary/month, GET /summary/year, GET /summary/forecast,
 * GET /summary/compare — read the caller's own expenses/categories only, addressed by
 * month/year/a/b query params, not a resource id; GET /rates —
 * a stateless FX preview keyed by date/currency pair, not tied to any user's data at all.
 * T088: GET /capture/tokens, POST /capture/tokens/:label/rotate, GET/PUT /capture/mapping —
 * addressed by the caller's own userId (via requireAuth) and a label string, never another
 * user's resource id, so there is no "user B's" row to fetch; POST /hooks/generic/:token is
 * unauthenticated by design (the path token is the credential) and is covered instead by
 * hooks.test.ts (unknown/revoked token -> 404, per-token 60/min rate limit).
 */
type Row = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path template; `:id` is replaced with the id `createForeignId` returns. */
  path: string;
  /** Creates the resource as user B and returns its id, to substitute for `:id` in `path`. */
  createForeignId: (userB: ApiClient) => Promise<string>;
  /** Request body for PATCH; defaults to {} when omitted. */
  body?: unknown;
};

const routes: Row[] = [
  {
    method: 'DELETE',
    path: '/me/sessions/:id',
    async createForeignId(userB) {
      const res = await userB.get('/me/sessions');
      const { sessions } = (await res.json()) as { sessions: { id: string }[] };
      const session = sessions[0];
      if (!session) throw new Error('expected user B to have a session');
      return session.id;
    },
  },
  {
    method: 'GET',
    path: '/jobs/:id',
    async createForeignId(userB) {
      const res = await userB.patch('/me', { defaultCurrency: 'USD' });
      const { job } = (await res.json()) as { job?: { id: string } };
      if (!job) throw new Error('expected a currency change to enqueue a job');
      return job.id;
    },
  },
  {
    method: 'PATCH',
    path: '/expenses/:id',
    body: { description: 'attempted takeover' },
    async createForeignId(userB) {
      return await createExpense(userB);
    },
  },
  {
    method: 'DELETE',
    path: '/expenses/:id',
    async createForeignId(userB) {
      return await createExpense(userB);
    },
  },
  {
    method: 'POST',
    path: '/expenses/:id/restore',
    async createForeignId(userB) {
      const id = await createExpense(userB);
      const del = await userB.delete(`/expenses/${id}`);
      if (del.status !== 204) throw new Error('expected user B to soft-delete their expense');
      return id;
    },
  },
  {
    method: 'PATCH',
    path: '/categories/:id',
    body: { name: 'attempted takeover' },
    async createForeignId(userB) {
      return await createCategory(userB);
    },
  },
  {
    method: 'DELETE',
    path: '/categories/:id',
    async createForeignId(userB) {
      return await createCategory(userB);
    },
  },
  {
    method: 'GET',
    path: '/expenses/:id/versions',
    async createForeignId(userB) {
      return await createExpense(userB);
    },
  },
  {
    method: 'POST',
    path: '/imports/:id/commit',
    async createForeignId(userB) {
      return await createImportBatch(userB);
    },
  },
  {
    method: 'POST',
    path: '/imports/:id/undo',
    async createForeignId(userB) {
      return await createImportBatch(userB);
    },
  },
  {
    method: 'GET',
    path: '/summary/category/:id',
    async createForeignId(userB) {
      return await createCategory(userB);
    },
  },
  {
    method: 'POST',
    path: '/connections/:id/refresh',
    async createForeignId(userB) {
      return await createConnectedAccount(userB);
    },
  },
  {
    method: 'GET',
    path: '/connections/:id/calendars',
    async createForeignId(userB) {
      return await createConnectedAccount(userB);
    },
  },
  {
    method: 'PATCH',
    path: '/connections/:id',
    body: { label: 'attempted takeover' },
    async createForeignId(userB) {
      return await createConnectedAccount(userB);
    },
  },
  {
    method: 'POST',
    path: '/connections/:id/reconnect',
    async createForeignId(userB) {
      return await createConnectedAccount(userB);
    },
  },
  {
    method: 'DELETE',
    path: '/connections/:id',
    async createForeignId(userB) {
      return await createConnectedAccount(userB);
    },
  },
  {
    method: 'PATCH',
    path: '/widgets/:id',
    body: { settings: { currencies: ['USD'] } },
    async createForeignId(userB) {
      return (await createWidget(userB, { kind: 'currency', settings: { currencies: ['EUR'] } }))
        .id;
    },
  },
  {
    method: 'DELETE',
    path: '/widgets/:id',
    async createForeignId(userB) {
      return (await createWidget(userB, { kind: 'spend_pace' })).id;
    },
  },
];

const CSV_MAPPING = {
  date: 'date',
  amount: 'amount',
  currency: 'currency',
  description: 'description',
  dateFormat: 'YYYY-MM-DD' as const,
  decimalSeparator: '.' as const,
};

async function createImportBatch(userB: ApiClient): Promise<string> {
  const csv = 'date,amount,currency,description\n2026-09-01,5.00,GBP,ownership fixture\n';
  const form = new FormData();
  form.append('file', new File([csv], 'fixture.csv', { type: 'text/csv' }));
  form.append('mapping', JSON.stringify(CSV_MAPPING));
  const res = await userB.post('/imports', form);
  const { batch } = (await res.json()) as { batch?: { id: string } };
  if (!batch) throw new Error('expected user B to create an import batch');
  return batch.id;
}

async function createCategory(userB: ApiClient): Promise<string> {
  const res = await userB.post('/categories', {
    name: `ownership fixture ${crypto.randomUUID()}`,
    colour: '#123456',
  });
  const { category } = (await res.json()) as { category?: { id: string } };
  if (!category) throw new Error('expected user B to create a category');
  return category.id;
}

async function createExpense(userB: ApiClient): Promise<string> {
  const res = await userB.post('/expenses', {
    description: 'ownership fixture',
    amount: { minor: 500, currency: 'GBP' },
    date: '2026-09-01',
    categoryId: null,
    paidWith: 'card',
    kind: 'variable',
  });
  const { expense } = (await res.json()) as { expense?: { id: string } };
  if (!expense) throw new Error('expected user B to create an expense');
  return expense.id;
}

async function createWidget(
  user: ApiClient,
  body: unknown,
): Promise<{ id: string; place?: { name: string } }> {
  const res = await user.post('/widgets', body);
  const { widget } = (await res.json()) as { widget?: { id: string } };
  if (!widget) throw new Error('expected the user to create a widget');
  return widget;
}

/** Set in beforeAll; panels fixtures insert rows directly because connecting an account needs a
 * provider round-trip the ownership test has no reason to exercise. */
let db: Harness['db'];

async function createConnectedAccount(userB: ApiClient): Promise<string> {
  const { userId } = userB as ApiClient & { userId: string };
  const rows = await db.execute(sql`
    INSERT INTO connected_accounts
      (user_id, provider, address, label, colour, capabilities, granted_scopes, credential_enc,
       status, next_refresh_at)
    VALUES
      (${userId}, 'google', ${`owner-b-${crypto.randomUUID()}@example.com`}, 'B', 'teal',
       ARRAY['calendar'], ARRAY['calendar.readonly'], decode('00', 'hex'), 'connected', now())
    RETURNING id`);
  return (rows as unknown as { id: string }[])[0]!.id;
}

describe('ownership matrix', () => {
  let harness: Harness;
  let userA: ApiClient & { userId: string };
  let userB: ApiClient & { userId: string };

  beforeAll(async () => {
    harness = await startHarness(undefined, {
      withJobs: true,
      mailSources: { standards: fakeStandardsMail },
    });
    db = harness.db;
    await setGlobalFlag(db, 'panels.today', true);
    await setGlobalFlag(db, 'panels.google_calendar', true);
    await setGlobalFlag(db, 'panels.standards', true);
    for (const k of ['currency', 'weather', 'sunrise', 'spend_pace', 'fixed_costs']) {
      await setGlobalFlag(db, `widgets.${k}`, true);
    }
    userA = await harness.asUser('ownership-a@example.com');
    userB = await harness.asUser('ownership-b@example.com');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  it.each(routes)("$method $path as user A against user B's resource is isolated", async (row) => {
    // T009: Standard :id routes — user A cannot access user B's resources
    const foreignId = await row.createForeignId(userB);
    const path = row.path.replace(':id', foreignId);
    const res =
      row.method === 'GET'
        ? await userA.get(path)
        : row.method === 'POST'
          ? await userA.post(path)
          : row.method === 'PATCH'
            ? await userA.patch(path, row.body ?? {})
            : await userA.delete(path);

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('not_found');
  });

  describe('panels (spec 002)', () => {
    it("GET /panels/today, GET /connections and POST /panels/today/refresh never expose user B's accounts", async () => {
      const bAccount = await createConnectedAccount(userB);

      const today = await userA.get('/panels/today');
      expect(today.status).toBe(200);
      const todayJson = (await today.json()) as { accounts: { id: string }[] };
      expect(todayJson.accounts.map((a) => a.id)).not.toContain(bAccount);

      const list = await userA.get('/connections');
      expect(list.status).toBe(200);
      const listJson = (await list.json()) as { accounts: { id: string }[] };
      expect(listJson.accounts.map((a) => a.id)).not.toContain(bAccount);

      const refresh = await userA.post('/panels/today/refresh');
      expect(refresh.status).toBe(202);
      expect(((await refresh.json()) as { queued: string[] }).queued).not.toContain(bAccount);
    });

    it('GET /connections/providers is the same for both users (no per-user data)', async () => {
      const a = await userA.get('/connections/providers');
      const b = await userB.get('/connections/providers');
      expect(a.status).toBe(200);
      expect(await a.json()).toEqual(await b.json());
    });

    it("an OAuth state minted for user B is rejected in user A's session", async () => {
      const start = await userB.get('/connections/google/start?capabilities=calendar');
      expect(start.status).toBe(302);
      const state = new URL(start.headers.get('location')!).searchParams.get('state');
      expect(state).toBeTruthy();

      const before = await db.execute(sql`SELECT count(*)::int AS n FROM connected_accounts`);
      const cb = await userA.get(`/connections/google/callback?code=x&state=${state}`);
      expect(cb.status).toBe(302);
      expect(cb.headers.get('location')).toContain('error=');
      const after = await db.execute(sql`SELECT count(*)::int AS n FROM connected_accounts`);
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    });

    it("POST /connections/standards is scoped per user: the same address for two users creates two separate rows, and neither user's list exposes the other's (T070)", async () => {
      const address = `standards-ownership-${crypto.randomUUID()}@example.com`;
      const requestBody = {
        address,
        password: 'correct-app-password',
        imapHost: 'mail.example.com',
        imapPort: 993,
        capabilities: ['mail'] as const,
      };

      const resB = await userB.post('/connections/standards', requestBody);
      expect(resB.status).toBe(201);
      const bodyB = (await resB.json()) as { account: { id: string } };

      const resA = await userA.post('/connections/standards', requestBody);
      expect(resA.status).toBe(201);
      const bodyA = (await resA.json()) as { account: { id: string } };

      expect(bodyA.account.id).not.toBe(bodyB.account.id);

      const listA = await userA.get('/connections');
      const listAJson = (await listA.json()) as { accounts: { id: string }[] };
      expect(listAJson.accounts.map((a) => a.id)).not.toContain(bodyB.account.id);
      expect(listAJson.accounts.map((a) => a.id)).toContain(bodyA.account.id);

      const listB = await userB.get('/connections');
      const listBJson = (await listB.json()) as { accounts: { id: string }[] };
      expect(listBJson.accounts.map((a) => a.id)).not.toContain(bodyA.account.id);
    });
  });

  describe('widgets (spec 003)', () => {
    const LONDON = {
      name: 'London',
      admin1: 'England',
      country: 'United Kingdom',
      lat: 51.51,
      lon: -0.13,
      timeZone: 'Europe/London',
    };

    it("GET /widgets and GET /widgets/types never expose user B's widgets or kinds in use", async () => {
      const bWidget = await createWidget(userB, { kind: 'weather', place: LONDON });
      const bFixed = await createWidget(userB, { kind: 'fixed_costs' });
      await setGlobalFlag(db, 'widgets.fixed_costs', false);
      try {
        const list = await userA.get('/widgets');
        expect(list.status).toBe(200);
        const ids = ((await list.json()) as { widgets: { id: string }[] }).widgets.map((w) => w.id);
        expect(ids).not.toContain(bWidget.id);
        expect(ids).not.toContain(bFixed.id);

        const types = await userA.get('/widgets/types');
        const kinds = ((await types.json()) as { types: { kind: string }[] }).types.map(
          (t) => t.kind,
        );
        expect(kinds).not.toContain('fixed_costs');
      } finally {
        await setGlobalFlag(db, 'widgets.fixed_costs', true);
      }
    });

    it("POST /widgets with user B's placeId answers not_found and creates nothing", async () => {
      await createWidget(userB, { kind: 'weather', place: LONDON });
      const rows = await db.execute(
        sql`SELECT id FROM places WHERE user_id = ${userB.userId} LIMIT 1`,
      );
      const bPlace = (rows as unknown as { id: string }[])[0]!.id;
      const before = (await (await userA.get('/widgets')).json()) as { widgets: unknown[] };

      const res = await userA.post('/widgets', { kind: 'weather', placeId: bPlace });
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_found');
      const after = (await (await userA.get('/widgets')).json()) as { widgets: unknown[] };
      expect(after.widgets.length).toBe(before.widgets.length);
    });

    it('a place chosen by user A creates a row for A only, even at the same coordinates as B', async () => {
      await createWidget(userB, { kind: 'weather', place: LONDON });
      await createWidget(userA, { kind: 'weather', place: LONDON });
      const rows = (await db.execute(
        sql`SELECT user_id FROM places WHERE name = 'London'`,
      )) as unknown as { user_id: string }[];
      const owners = new Set(rows.map((r) => r.user_id));
      expect(owners).toEqual(new Set([userA.userId, userB.userId]));
      expect(rows.length).toBe(2);
    });

    it.todo("PUT /widgets/order with user B's id in the list answers not_found (T042)");
    it.todo("POST /widgets/refresh marks only the caller's places due (T043)");
    it.todo(
      'GET /places/search and POST /places/resolve create no places row and audit only A (T051)',
    );
  });
});
