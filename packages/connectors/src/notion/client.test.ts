import { describe, expect, it, vi } from 'vitest';
import queryFixture from './fixtures/query-data-source.json' with { type: 'json' };
import createFixture from './fixtures/page-create.json' with { type: 'json' };
import updateFixture from './fixtures/page-update.json' with { type: 'json' };
import rateLimited from './fixtures/rate-limited-429.json' with { type: 'json' };
import unauthorized from './fixtures/unauthorized-401.json' with { type: 'json' };
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
