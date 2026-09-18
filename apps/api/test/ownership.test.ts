import { startHarness, type ApiClient, type Harness } from './harness.js';

/**
 * Ownership matrix (CLAUDE.md "Testing rules": every route x user A / user B must prove
 * isolation). Each row hits `path` as user A but substituted with user B's id, and expects
 * not_found (404) or an empty result — never user B's data.
 *
 * T025: /me, /me/sessions/:id and /jobs/:id don't exist as routes yet (no apps/api/src/routes
 * directory today). Phase 3 (T036) populates this array as those routes land; the loop below
 * runs over zero rows until then, so this file compiles and passes vacuously rather than
 * asserting against routes that don't exist.
 */
type Row = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path template; `:id` is replaced with user B's id when called as user A. */
  path: string;
  bodyFactory?: (otherUserId: string) => unknown;
};

const routes: Row[] = [
  // { method: 'GET', path: '/me/sessions/:id' },
  // { method: 'GET', path: '/jobs/:id' },
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

  it.each(routes)("$method $path as user A against user B's id is isolated", async (row) => {
    const path = row.path.replace(':id', userB.userId);
    const body = row.bodyFactory?.(userB.userId);
    const res =
      row.method === 'GET'
        ? await userA.get(path)
        : row.method === 'POST'
          ? await userA.post(path, body)
          : row.method === 'PATCH'
            ? await userA.patch(path, body)
            : await userA.delete(path);

    if (res.status === 404) return;
    expect(res.status).toBeLessThan(300);
    const json = (await res.json()) as unknown;
    expect(Array.isArray(json) ? json : Object.keys(json as object)).toHaveLength(0);
  });

  it('has no rows yet — placeholder until Phase 3 routes land (T036)', () => {
    expect(routes).toEqual([]);
  });
});
