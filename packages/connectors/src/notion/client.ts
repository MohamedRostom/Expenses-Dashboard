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
      const retryAfterSeconds = Number(res.headers.get('Retry-After') ?? '1');
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

  async createPage(
    databaseId: string,
    properties: Record<string, unknown>,
  ): Promise<NotionPageResult> {
    const res = await this.request('/pages', {
      method: 'POST',
      body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
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

  /** Checks the database's existing properties against KNOWN_LAYOUT and creates any that are
   * missing (additive only — never removes or renames an existing property, per CLAUDE.md's
   * "Rostom's existing table ... lacks Currency and Expense ID; the connector offers to add
   * them on connect"). */
  async ensureLayout(databaseId: string): Promise<{ added: string[] }> {
    const res = await this.request(`/databases/${databaseId}`, { method: 'GET' });
    const db = (await res.json()) as { properties: Record<string, unknown> };

    const missing = Object.keys(KNOWN_LAYOUT).filter((name) => !(name in db.properties));
    if (missing.length === 0) return { added: [] };

    const patchProperties: Record<string, unknown> = {};
    for (const name of missing) patchProperties[name] = KNOWN_LAYOUT[name];

    await this.request(`/databases/${databaseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: patchProperties }),
    });

    return { added: missing };
  }
}
