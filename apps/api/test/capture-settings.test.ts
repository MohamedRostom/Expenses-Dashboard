import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';

/** T085: authenticated capture-settings routes. */
describe('capture settings', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it('lists tokens without the secret', async () => {
    const user = await h.asUser('settings-list@example.com');
    const rotate = await user.post('/capture/tokens/generic/rotate');
    expect(rotate.status).toBe(200);

    const list = await user.get('/capture/tokens');
    expect(list.status).toBe(200);
    const body = (await list.json()) as { tokens: Record<string, unknown>[] };
    expect(body.tokens.length).toBeGreaterThan(0);
    for (const token of body.tokens) {
      expect(token).not.toHaveProperty('secret');
      expect(token).not.toHaveProperty('tokenHash');
      expect(token).not.toHaveProperty('token_hash');
    }
  });

  it('rotate returns a new URL once and revokes the old one', async () => {
    const user = await h.asUser('settings-rotate@example.com');
    const first = await user.post('/capture/tokens/generic/rotate');
    const firstBody = (await first.json()) as {
      secret: string;
      url: string;
      token: { id: string };
    };
    expect(firstBody.secret).toBeTruthy();
    expect(firstBody.url).toContain(firstBody.secret);

    const second = await user.post('/capture/tokens/generic/rotate');
    const secondBody = (await second.json()) as { secret: string; token: { id: string } };
    expect(secondBody.secret).not.toBe(firstBody.secret);
    expect(secondBody.token.id).not.toBe(firstBody.token.id);

    // The old token is now revoked: a webhook call with it 404s.
    const attempt = await h.app.request(`/hooks/generic/${firstBody.secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '1.00', currency: 'GBP', description: 'x' }),
    });
    expect(attempt.status).toBe(404);
  });

  it('GET/PUT mapping round-trips', async () => {
    const user = await h.asUser('settings-mapping@example.com');
    const createRes = await user.post('/categories', { name: 'Groceries', colour: '#1f6e5a' });
    const groceries = (await createRes.json()) as { category: { id: string } };

    const empty = await user.get('/capture/mapping');
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as { mappings: unknown[] };
    expect(emptyBody.mappings).toEqual([]);

    const put = await user.put('/capture/mapping', {
      mappings: [{ label: 'groceries', categoryId: groceries.category.id }],
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { mappings: { label: string; categoryId: string }[] };
    expect(putBody.mappings).toEqual([{ label: 'groceries', categoryId: groceries.category.id }]);

    const get = await user.get('/capture/mapping');
    const getBody = (await get.json()) as { mappings: { label: string; categoryId: string }[] };
    expect(getBody.mappings).toEqual([{ label: 'groceries', categoryId: groceries.category.id }]);
  });
});
