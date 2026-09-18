import { startHarness, type ApiClient, type Harness } from './harness.js';

/**
 * Ownership matrix (CLAUDE.md "Testing rules": every route x user A / user B must prove
 * isolation). Each row creates a resource as user B, then hits `path` (with user B's resource
 * id substituted) as user A, and expects not_found (404) — never user B's data.
 *
 * T036: Phase 1 id-addressed routes only. Routes intentionally excluded because they have no
 * "someone else's" resource in the URL (self-operations or public/no-ownership-concept routes):
 * GET /me, PATCH /me, GET /me/export, DELETE /me, GET /me/sessions — act on the caller only;
 * GET /currencies, GET /flags — no per-user id in the path;
 * POST /auth/*, GET /auth/google/* — public, pre-session;
 * DELETE /me/password, DELETE /me/oauth/:provider — act on the caller's own account, addressed
 * by provider name (not another user's resource id), so there is no "user B's" row to fetch.
 */
type Row = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path template; `:id` is replaced with the id `createForeignId` returns. */
  path: string;
  /** Creates the resource as user B and returns its id, to substitute for `:id` in `path`. */
  createForeignId: (userB: ApiClient) => Promise<string>;
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
];

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
            ? await userA.patch(path)
            : await userA.delete(path);

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe('not_found');
  });
});
