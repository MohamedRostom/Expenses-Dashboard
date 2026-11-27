import {
  NotionAuthError,
  NotionApiError,
  type NotionPageResult,
  type QueryDataSourceResult,
} from './client.js';
import { KNOWN_LAYOUT } from './known-layout.js';
import queryFixture from './fixtures/query-data-source.json' with { type: 'json' };

let pageCounter = 0;

/** In-memory fake of NotionClient, seeded from the query-data-source fixture. Supports
 * injecting a 429-then-success or a 401 scenario via `failNextWith`, for contract tests and
 * for the (later) sync service's own tests without a real Notion workspace. */
export class FakeNotion {
  private readonly pages = new Map<string, NotionPageResult>();
  private readonly databaseProperties = new Set<string>(['Expense', 'Amount']); // a sparse starting layout, like Rostom's existing table
  private failNext: 'rate_limited' | 'unauthorized' | null = null;
  private failOauth: 'refresh_refused' | 'revoke_error' | null = null;
  private sharedContent = true;
  private tokenCounter = 0;

  constructor(seed: NotionPageResult[] = queryFixture.response.body.results as NotionPageResult[]) {
    for (const p of seed) this.pages.set(p.id, p);
  }

  /** Makes the next call throw/behave as if Notion returned this status once. */
  failNextWith(kind: 'rate_limited' | 'unauthorized' | 'refresh_refused' | 'revoke_error'): void {
    if (kind === 'refresh_refused' || kind === 'revoke_error') this.failOauth = kind;
    else this.failNext = kind;
  }

  setSharedContent(shared: boolean): void {
    this.sharedContent = shared;
  }

  /** Tokens passed to refreshToken / revokeToken, in call order, for tests to assert on. */
  readonly refreshed: string[] = [];
  readonly revoked: string[] = [];

  async refreshToken(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    this.refreshed.push(refreshToken);
    if (this.failOauth === 'refresh_refused') {
      this.failOauth = null;
      throw new NotionAuthError('Notion refused the refresh token');
    }
    this.tokenCounter += 1;
    return {
      access_token: `fake-notion-access-token-${this.tokenCounter}`,
      refresh_token: `fake-notion-refresh-token-${this.tokenCounter}`,
    };
  }

  async revokeToken(token: string): Promise<void> {
    this.revoked.push(token);
    if (this.failOauth === 'revoke_error') {
      this.failOauth = null;
      throw new NotionApiError('Notion revoke 500', 500);
    }
  }

  async hasSharedContent(): Promise<boolean> {
    this.maybeFail();
    return this.sharedContent;
  }

  private maybeFail(): void {
    if (this.failNext === 'unauthorized') {
      this.failNext = null;
      throw new NotionAuthError();
    }
    if (this.failNext === 'rate_limited') {
      // A real 429 is retried once by NotionClient and then succeeds — the fake models that
      // "already retried" outcome by just clearing the flag and proceeding, since it has no
      // network layer to actually delay. A test asserting the 429 itself uses the fixture and
      // the real NotionClient with a scripted fetch instead (see client.test.ts).
      this.failNext = null;
    }
  }

  async queryDataSource(_dataSourceId: string, cursor?: string): Promise<QueryDataSourceResult> {
    this.maybeFail();
    // Real Notion's data source query excludes archived pages by default — returning them here
    // would let contract tests pass against a fake that behaves differently from the real API.
    const all = [...this.pages.values()].filter((p) => !p.archived);
    if (!cursor) {
      return { results: all, next_cursor: null, has_more: false };
    }
    return { results: [], next_cursor: null, has_more: false };
  }

  async createPage(
    _databaseId: string,
    properties: Record<string, unknown>,
  ): Promise<NotionPageResult> {
    this.maybeFail();
    pageCounter += 1;
    const page: NotionPageResult = {
      id: `fake-page-${pageCounter}`,
      last_edited_time: new Date().toISOString(),
      archived: false,
      properties,
    };
    this.pages.set(page.id, page);
    return page;
  }

  async updatePage(pageId: string, properties: Record<string, unknown>): Promise<NotionPageResult> {
    this.maybeFail();
    const existing = this.pages.get(pageId);
    if (!existing) throw new NotionApiError(`no such page: ${pageId}`, 404);
    const updated: NotionPageResult = {
      ...existing,
      properties: { ...existing.properties, ...properties },
      last_edited_time: new Date().toISOString(),
    };
    this.pages.set(pageId, updated);
    return updated;
  }

  async archivePage(pageId: string): Promise<NotionPageResult> {
    this.maybeFail();
    const existing = this.pages.get(pageId);
    if (!existing) throw new NotionApiError(`no such page: ${pageId}`, 404);
    const updated: NotionPageResult = {
      ...existing,
      archived: true,
      last_edited_time: new Date().toISOString(),
    };
    this.pages.set(pageId, updated);
    return updated;
  }

  async searchDatabases(): Promise<
    Array<{
      databaseId: string;
      dataSourceId: string;
      title: string;
      properties: Record<string, unknown>;
    }>
  > {
    this.maybeFail();
    return [
      {
        databaseId: 'fake-db-1',
        dataSourceId: 'fake-db-1',
        title: '💷 Expenses',
        properties: Object.fromEntries([...this.databaseProperties].map((n) => [n, {}])),
      },
    ];
  }

  async createDatabase(
    _parentPageId: string,
    title: string,
  ): Promise<{ id: string; dataSourceId: string }> {
    this.maybeFail();
    const id = `fake-db-created-${title.replace(/\s+/g, '-').toLowerCase()}`;
    for (const name of Object.keys(KNOWN_LAYOUT)) this.databaseProperties.add(name);
    return { id, dataSourceId: id };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for parity with the real NotionClient's signature that callers rely on.
  async ensureLayout(_databaseId: string): Promise<{ added: string[] }> {
    this.maybeFail();
    const missing = Object.keys(KNOWN_LAYOUT).filter((name) => !this.databaseProperties.has(name));
    for (const name of missing) this.databaseProperties.add(name);
    return { added: missing };
  }
}
