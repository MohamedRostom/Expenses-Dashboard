import { KNOWN_LAYOUT } from './known-layout.js';
import { TokenBucket } from './token-bucket.js';

const BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';
const MAX_RETRIES = 1; // one retry after a 429, per research.md R8

export class NotionAuthError extends Error {
  constructor(message = 'Notion access token is invalid or revoked') {
    super(message);
    this.name = 'NotionAuthError';
  }
}

export class NotionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'NotionApiError';
  }
}

export interface NotionPageResult {
  id: string;
  last_edited_time: string;
  archived: boolean;
  properties: Record<string, unknown>;
}

export interface QueryDataSourceResult {
  results: NotionPageResult[];
  next_cursor: string | null;
  has_more: boolean;
}

/** Real Notion API client (data sources, 2025-09-03). Honours the 3 rps limit with a token
 * bucket and retries a single 429 after its Retry-After. A 401 throws NotionAuthError so the
 * caller (the sync service, a later task) can mark the connection status='error'. */
export class NotionClient {
  private readonly bucket = new TokenBucket(3);

  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  private async request(
    path: string,
    init: RequestInit = {},
    retriesLeft = MAX_RETRIES,
  ): Promise<Response> {
    await this.bucket.take();

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      // No timeout previously — a hung connection to Notion would block sync indefinitely.
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (res.status === 401) {
      throw new NotionAuthError();
    }

    if (res.status === 429 && retriesLeft > 0) {
      // Notion's own docs cap Retry-After well under a minute, but nothing stops a malicious or
      // buggy upstream from sending an enormous value — clamp so a single retry can't stall a
      // request (or the job runner processing it) for an unbounded amount of time.
      const MAX_RETRY_AFTER_SECONDS = 30;
      const retryAfterSeconds = Math.min(
        Number(res.headers.get('Retry-After') ?? '1') || 1,
        MAX_RETRY_AFTER_SECONDS,
      );
      await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
      return this.request(path, init, retriesLeft - 1);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new NotionApiError(`Notion API ${res.status}: ${body}`, res.status);
    }

    return res;
  }

  async queryDataSource(dataSourceId: string, cursor?: string): Promise<QueryDataSourceResult> {
    const res = await this.request(`/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
    });
    const body = (await res.json()) as {
      results: NotionPageResult[];
      next_cursor: string | null;
      has_more: boolean;
    };
    return body;
  }

  /** C10: 2025-09-03 pages are created against a data source, not a database directly. */
  async createPage(
    dataSourceId: string,
    properties: Record<string, unknown>,
  ): Promise<NotionPageResult> {
    const res = await this.request('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { type: 'data_source_id', data_source_id: dataSourceId },
        properties,
      }),
    });
    return (await res.json()) as NotionPageResult;
  }

  async updatePage(pageId: string, properties: Record<string, unknown>): Promise<NotionPageResult> {
    const res = await this.request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
    return (await res.json()) as NotionPageResult;
  }

  /** Notion has no hard delete via API — "delete" is archiving the page. */
  async archivePage(pageId: string): Promise<NotionPageResult> {
    const res = await this.request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    return (await res.json()) as NotionPageResult;
  }

  /** C10: 2025-09-03 search no longer has a `database` object — a database is a container of
   * data sources, so this lists data sources (POST /search filtered to object=data_source) and
   * returns each one's own id (to query/write against) alongside its parent database id
   * (to detect "same database, different data source" on reconnect). */
  async searchDatabases(): Promise<
    Array<{
      databaseId: string;
      dataSourceId: string;
      title: string;
      properties: Record<string, unknown>;
    }>
  > {
    const res = await this.request('/search', {
      method: 'POST',
      body: JSON.stringify({ filter: { property: 'object', value: 'data_source' } }),
    });
    const body = (await res.json()) as {
      results: Array<{
        id: string;
        name?: string;
        title?: Array<{ plain_text?: string }>;
        parent?: { type: 'database_id'; database_id: string };
        properties: Record<string, unknown>;
      }>;
    };
    return body.results.map((r) => ({
      databaseId: r.parent?.database_id ?? r.id,
      dataSourceId: r.id,
      title: r.name ?? r.title?.[0]?.plain_text ?? 'Untitled',
      properties: r.properties,
    }));
  }

  /** Creates a new database under `parentPageId` with the known layout pre-set on its initial
   * data source (2025-09-03: `properties` moves under `initial_data_source`, and the response's
   * `data_sources[0].id` is what queries/writes go against — the database id itself is only a
   * container). */
  async createDatabase(
    parentPageId: string,
    title: string,
  ): Promise<{ id: string; dataSourceId: string }> {
    const res = await this.request('/databases', {
      method: 'POST',
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        title: [{ text: { content: title } }],
        initial_data_source: { properties: KNOWN_LAYOUT },
      }),
    });
    const body = (await res.json()) as { id: string; data_sources?: Array<{ id: string }> };
    return { id: body.id, dataSourceId: body.data_sources?.[0]?.id ?? body.id };
  }

  /** Checks the data source's existing properties against KNOWN_LAYOUT and creates any that are
   * missing (additive only — never removes or renames an existing property, per CLAUDE.md's
   * "Rostom's existing table ... lacks Currency and Expense ID; the connector offers to add
   * them on connect"). C10: properties live on `/data_sources/{id}`, not `/databases/{id}`. */
  async ensureLayout(dataSourceId: string): Promise<{ added: string[] }> {
    const res = await this.request(`/data_sources/${dataSourceId}`, { method: 'GET' });
    const ds = (await res.json()) as { properties: Record<string, unknown> };

    const missing = Object.keys(KNOWN_LAYOUT).filter((name) => !(name in ds.properties));
    if (missing.length === 0) return { added: [] };

    const patchProperties: Record<string, unknown> = {};
    for (const name of missing) patchProperties[name] = KNOWN_LAYOUT[name];

    await this.request(`/data_sources/${dataSourceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: patchProperties }),
    });

    return { added: missing };
  }
}
