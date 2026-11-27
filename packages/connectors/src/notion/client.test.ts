import { describe, expect, it, vi } from 'vitest';
import queryFixture from './fixtures/query-data-source.json' with { type: 'json' };
import createFixture from './fixtures/page-create.json' with { type: 'json' };
import updateFixture from './fixtures/page-update.json' with { type: 'json' };
import rateLimited from './fixtures/rate-limited-429.json' with { type: 'json' };
import unauthorized from './fixtures/unauthorized-401.json' with { type: 'json' };
import refreshOk from './fixtures/token-refresh-200.json' with { type: 'json' };
import refreshInvalid from './fixtures/token-refresh-400-invalid-grant.json' with { type: 'json' };
import revokeOk from './fixtures/revoke-200.json' with { type: 'json' };
import searchEmpty from './fixtures/search-empty-200.json' with { type: 'json' };
import { NotionClient, NotionAuthError } from './client.js';
import { FakeNotion } from './fake.js';

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('NotionClient (replaying hand-authored 2025-09-03 fixtures)', () => {
  it('queryDataSource: returns pages and next_cursor from a data source query', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, queryFixture.response.body));
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    const result = await client.queryDataSource(queryFixture.request.dataSourceId);

    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.id).toBe('page-aaa');
    expect(result.next_cursor).toBe('cursor-page-2');
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(`/data_sources/${queryFixture.request.dataSourceId}/query`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Notion-Version': '2025-09-03' }),
      }),
    );
  });

  it('queryDataSource: paginates with a cursor', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { start_cursor?: string };
      expect(body.start_cursor).toBe('cursor-page-2');
      return jsonResponse(200, { results: [], next_cursor: null, has_more: false });
    });
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    const result = await client.queryDataSource('ds-1', 'cursor-page-2');

    expect(result.results).toEqual([]);
    expect(result.has_more).toBe(false);
  });

  it('createPage: posts to /pages with a data_source_id parent (C10: 2025-09-03 shape)', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { parent: Record<string, unknown> };
      expect(body.parent).toEqual({ type: 'data_source_id', data_source_id: 'ds-taxi' });
      return jsonResponse(200, createFixture.response.body);
    });
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    const page = await client.createPage('ds-taxi', createFixture.request.properties);

    expect(page.id).toBe('page-taxi-1');
  });

  it('updatePage: patches /pages/:id and returns the updated page', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, updateFixture.response.body));
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    const page = await client.updatePage(
      updateFixture.request.pageId,
      updateFixture.request.properties,
    );

    expect(page.properties.Amount).toEqual({ number: 4.0 });
  });

  it('archivePage: patches archived:true', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { ...updateFixture.response.body, archived: true }),
    );
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    const page = await client.archivePage('page-aaa');

    expect(page.archived).toBe(true);
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(call[1].body as string)).toEqual({ archived: true });
  });

  it('429 with Retry-After: waits then retries once and succeeds', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, rateLimited.response.body, rateLimited.response.headers),
      )
      .mockResolvedValueOnce(jsonResponse(200, createFixture.response.body));
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    const promise = client.createPage(
      createFixture.request.databaseId,
      createFixture.request.properties,
    );
    await vi.advanceTimersByTimeAsync(1000);
    const page = await promise;

    expect(page.id).toBe('page-taxi-1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('401: throws NotionAuthError so the caller can mark the connection revoked', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, unauthorized.response.body));
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    await expect(client.queryDataSource('ds-1')).rejects.toBeInstanceOf(NotionAuthError);
  });

  it('ensureLayout: reads/writes /data_sources/:id, not /databases/:id (C10)', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      return urls.length === 1
        ? jsonResponse(200, { properties: { Expense: {}, Amount: {} } })
        : jsonResponse(200, { properties: {} });
    });
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    const result = await client.ensureLayout('ds-1');

    expect(urls.every((u) => u.includes('/data_sources/ds-1'))).toBe(true);
    expect(result.added).toContain('Currency');
    expect(result.added).toContain('Expense ID');
    expect(result.added).not.toContain('Expense');
  });

  it('searchDatabases: filters on object=data_source and returns databaseId/dataSourceId (C10)', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { filter: { value: string } };
      expect(body.filter.value).toBe('data_source');
      return jsonResponse(200, {
        results: [
          {
            id: 'ds-1',
            name: '💷 Expenses',
            parent: { type: 'database_id', database_id: 'db-1' },
            properties: {},
          },
        ],
      });
    });
    const client = new NotionClient('token', fetchImpl as unknown as typeof fetch);

    const [db] = await client.searchDatabases();

    expect(db).toEqual({
      databaseId: 'db-1',
      dataSourceId: 'ds-1',
      title: '💷 Expenses',
      properties: {},
    });
  });
});

describe('NotionClient OAuth + search helpers (BUG-001)', () => {
  const oauth = { clientId: 'cid', clientSecret: 'secret' };
  const basic = `Basic ${btoa('cid:secret')}`;
  const make = (fetchImpl: unknown) =>
    new NotionClient('token', fetchImpl as typeof fetch, undefined, oauth);

  it('refreshToken: posts grant_type refresh_token with Basic auth and returns both tokens', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, refreshOk.response.body));
    const out = await make(fetchImpl).refreshToken('old-refresh');
    expect(out).toEqual({
      access_token: refreshOk.response.body.access_token,
      refresh_token: refreshOk.response.body.refresh_token,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/oauth/token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(basic);
    expect(JSON.parse(init.body as string)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
    });
  });

  it.each([400, 401])('refreshToken: %s throws NotionAuthError', async (status) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status, refreshInvalid.response.body));
    await expect(make(fetchImpl).refreshToken('x')).rejects.toBeInstanceOf(NotionAuthError);
  });

  it('revokeToken: posts { token } with Basic auth and resolves on 200', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, revokeOk.response.body));
    await expect(make(fetchImpl).revokeToken('tok')).resolves.toBeUndefined();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.notion.com/v1/oauth/revoke');
    expect((init.headers as Record<string, string>).Authorization).toBe(basic);
    expect(JSON.parse(init.body as string)).toEqual({ token: 'tok' });
  });

  it('revokeToken: rejects on a non-2xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {}));
    await expect(make(fetchImpl).revokeToken('tok')).rejects.toThrow();
  });

  it('revokeToken: rejects after a 5 s abort', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    const p = make(fetchImpl).revokeToken('tok');
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    vi.useRealTimers();
  });

  it('hasSharedContent: searches with page_size 1; false when empty, true otherwise', async () => {
    const empty = vi.fn(async () => jsonResponse(200, searchEmpty.response.body));
    expect(await make(empty).hasSharedContent()).toBe(false);
    const [url, init] = empty.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/search');
    expect(JSON.parse(init.body as string)).toEqual({ page_size: 1 });
    const some = vi.fn(async () =>
      jsonResponse(200, { ...searchEmpty.response.body, results: [{ id: 'p1' }] }),
    );
    expect(await make(some).hasSharedContent()).toBe(true);
  });
});

describe('FakeNotion OAuth + search helpers (BUG-001)', () => {
  it('refreshToken returns the shape of the recorded fixture', async () => {
    const out = await new FakeNotion().refreshToken('r');
    expect(Object.keys(out).sort()).toEqual(['access_token', 'refresh_token']);
    expect(Object.keys(refreshOk.response.body)).toEqual(expect.arrayContaining(Object.keys(out)));
    expect(out.refresh_token).not.toBe('r');
  });

  it('failNextWith("refresh_refused"): refreshToken throws NotionAuthError once', async () => {
    const fake = new FakeNotion();
    fake.failNextWith('refresh_refused');
    await expect(fake.refreshToken('r')).rejects.toBeInstanceOf(NotionAuthError);
    await expect(fake.refreshToken('r')).resolves.toBeDefined();
  });

  it('failNextWith("revoke_error"): revokeToken rejects once, then resolves', async () => {
    const fake = new FakeNotion();
    fake.failNextWith('revoke_error');
    await expect(fake.revokeToken('t')).rejects.toThrow();
    await expect(fake.revokeToken('t')).resolves.toBeUndefined();
  });

  it('setSharedContent drives hasSharedContent (default true)', async () => {
    const fake = new FakeNotion();
    expect(await fake.hasSharedContent()).toBe(true);
    fake.setSharedContent(false);
    expect(await fake.hasSharedContent()).toBe(false);
  });
});

describe('FakeNotion (same scenarios as NotionClient, in-memory)', () => {
  it('queryDataSource: returns the seeded fixture pages', async () => {
    const fake = new FakeNotion();
    const result = await fake.queryDataSource('ds-1');
    expect(result.results).toHaveLength(2);
  });

  it('createPage/updatePage/archivePage: in-memory page store round-trips', async () => {
    const fake = new FakeNotion();
    const created = await fake.createPage('db-1', { Expense: { title: [] } });
    const updated = await fake.updatePage(created.id, { Amount: { number: 9 } });
    expect(updated.properties.Amount).toEqual({ number: 9 });
    const archived = await fake.archivePage(created.id);
    expect(archived.archived).toBe(true);
  });

  it('failNextWith("unauthorized"): the next call throws NotionAuthError', async () => {
    const fake = new FakeNotion();
    fake.failNextWith('unauthorized');
    await expect(fake.queryDataSource('ds-1')).rejects.toBeInstanceOf(NotionAuthError);
  });

  it('ensureLayout: adds the missing known-layout properties to the sparse starting layout', async () => {
    const fake = new FakeNotion();
    const result = await fake.ensureLayout('db-1');
    expect(result.added).toContain('Currency');
    expect(result.added).toContain('Expense ID');
  });
});
