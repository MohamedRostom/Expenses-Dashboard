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

  constructor(seed: NotionPageResult[] = queryFixture.response.body.results as NotionPageResult[]) {
    for (const p of seed) this.pages.set(p.id, p);
  }

  /** Makes the next call throw/behave as if Notion returned this status once. */
  failNextWith(kind: 'rate_limited' | 'unauthorized'): void {
    this.failNext = kind;
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
    const all = [...this.pages.values()];
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for parity with the real NotionClient's signature that callers rely on.
  async ensureLayout(_databaseId: string): Promise<{ added: string[] }> {
    this.maybeFail();
    const missing = Object.keys(KNOWN_LAYOUT).filter((name) => !this.databaseProperties.has(name));
    for (const name of missing) this.databaseProperties.add(name);
    return { added: missing };
  }
}
