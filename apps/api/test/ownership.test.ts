import { startHarness, type ApiClient, type Harness } from './harness.js';

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
 * the path/body to substitute); GET /summary/month, GET /summary/year — read the caller's own
 * expenses/categories only, addressed by month/year query params, not a resource id; GET /rates —
 * a stateless FX preview keyed by date/currency pair, not tied to any user's data at all.
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

describe('ownership matrix', () => {
  let harness: Harness;
  let userA: ApiClient & { userId: string };
  let userB: ApiClient & { userId: string };

  beforeAll(async () => {
    harness = await startHarness();
    userA = await harness.asUser('ownership-a@example.com');
    userB = await harness.asUser('ownership-b@example.com');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  it.each(routes)("$method $path as user A against user B's resource is isolated", async (row) => {
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
});
