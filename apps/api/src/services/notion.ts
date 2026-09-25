// T080: Notion OAuth + sync service (research.md R8). Public OAuth (authorization-code, no
// PKCE — Notion's documented flow), token exchange with a Basic auth header, token encrypted
// at rest via SecretBox. Sync applies packages/core/src/sync/diff.ts against a NotionClient
// (or FakeNotion in tests/mocks — both share the same shape).
import { and, eq } from 'drizzle-orm';
import {
  notionConnections,
  expenses as expensesTable,
  expenseVersions,
  categories as categoriesTable,
  users as usersTable,
  type Db,
} from '@desk/db';
import { NotionClient, NotionAuthError, KNOWN_LAYOUT } from '@desk/connectors/notion';
import type { NotionPageResult } from '@desk/connectors/notion';
import {
  diff,
  toNotionProperties,
  fromNotionProperties,
  type LocalRow,
  type NotionPage,
} from '@desk/core';
import type { SecretBox } from '../adapters/secret-box.js';
import type { ExpensesService } from './expenses.js';
import { ApiError } from '../lib/api-error.js';

export type NotionConfig = {
  clientId: string;
  clientSecret: string;
  appOrigin: string;
  /** Overridable for mocks/tests; defaults to the real Notion API inside NotionClient. */
  apiBase?: string | undefined;
  /** Overridable fetch (mocks/tests route it at an in-process Hono fake instead of a real
   * network call — see infra/mocks/src/notion-fake-routes.ts). Defaults to global fetch. */
  fetchImpl?: typeof fetch | undefined;
};

export type Clock = { now(): Date };

const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

const ADDED_VIA_TO_NOTION: Record<string, string> = {
  dashboard: 'Dashboard',
  notion: 'Notion',
  phone: 'Phone',
  import: 'Dashboard', // no "Import" option in KNOWN_LAYOUT — closest fit
};

/** Does `db.properties` collide on a KNOWN_LAYOUT property name with an incompatible type?
 * ensureLayout is additive-only, so anything else is fine to connect to. */
function isCompatible(properties: Record<string, unknown>): boolean {
  for (const [name, spec] of Object.entries(KNOWN_LAYOUT)) {
    const existing = properties[name] as { type?: string } | undefined;
    if (!existing) continue;
    const expectedType = Object.keys(spec as Record<string, unknown>)[0];
    if (existing.type && expectedType && existing.type !== expectedType) return false;
  }
  return true;
}

export function createNotionService(
  db: Db,
  secretBox: SecretBox,
  config: NotionConfig,
  expensesService: ExpensesService,
  clock: Clock,
  /** C1: enqueues the recurring `notion.sync` job the first time a table is connected — without
   * this nothing ever schedules the 5-minute cron sync (only the debounced write trigger ran). */
  enqueue?: (name: string, payload: unknown, opts?: { userId?: string }) => Promise<string>,
) {
  // ponytail: both debounce maps below are in-memory per-process — fine for Stage 1's single
  // Fly container; a Workers deployment (Stage 2) would need these moved to a DB-backed
  // "last requested at" column, since timers don't survive across isolates.
  const lastSyncRequestAt = new Map<string, number>();
  const DEBOUNCE_MS = 10_000;
  const pendingWriteTriggers = new Map<string, ReturnType<typeof setTimeout>>();

  /** T080 R8: called from an expense-write route (fire-and-forget) to debounce-in a sync
   * ~10s after the last write, instead of waiting for the 5-minute cron. No-op if the user
   * has no connected Notion connection — checked lazily when the timer fires, not here, to
   * keep the write path itself synchronous and cheap. */
  function triggerSyncSoon(userId: string): void {
    const existing = pendingWriteTriggers.get(userId);
    if (existing) clearTimeout(existing);
    pendingWriteTriggers.set(
      userId,
      setTimeout(() => {
        pendingWriteTriggers.delete(userId);
        getConnection(userId)
          .then((conn) => (conn?.status === 'connected' ? syncNow(userId) : undefined))
          .catch(() => {
            // best-effort: the 5-minute cron will pick up anything this misses.
          });
      }, DEBOUNCE_MS),
    );
  }

  function client(accessToken: string): NotionClient {
    return new NotionClient(accessToken, config.fetchImpl ?? fetch, config.apiBase);
  }

  async function getConnection(userId: string) {
    const [row] = await db
      .select()
      .from(notionConnections)
      .where(eq(notionConnections.userId, userId))
      .limit(1);
    return row ?? null;
  }

  function authorizeUrl(state: string, redirectUri: string): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('owner', 'user');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  }

  /** Exchanges an authorization code for a token, per Notion's documented flow: Basic auth
   * header of client_id:client_secret, no PKCE. */
  async function exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{
    access_token: string;
    workspace_id: string;
    workspace_name: string;
    bot_id: string;
  }> {
    const basic = btoa(`${config.clientId}:${config.clientSecret}`);
    const fetchImpl = config.fetchImpl ?? fetch;
    const res = await fetchImpl(config.apiBase ? `${config.apiBase}/oauth/token` : TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    if (!res.ok) {
      throw new ApiError('validation_failed', 'Notion token exchange failed', 400);
    }
    return (await res.json()) as {
      access_token: string;
      workspace_id: string;
      workspace_name: string;
      bot_id: string;
    };
  }

  /** Stores the connection (upsert — one per user, per data-model.md). New connections default
   * to direction 'both' and no database until the user picks/creates one via setConnection. */
  async function connect(
    userId: string,
    token: { access_token: string; workspace_id: string; workspace_name: string; bot_id: string },
  ): Promise<void> {
    const enc = await secretBox.seal(token.access_token);
    const existing = await getConnection(userId);
    if (existing) {
      await db
        .update(notionConnections)
        .set({
          workspaceId: token.workspace_id,
          workspaceName: token.workspace_name,
          botId: token.bot_id,
          accessTokenEnc: new TextEncoder().encode(enc),
          status: 'connected',
          lastError: null,
          updatedAt: clock.now(),
        })
        .where(eq(notionConnections.userId, userId));
    } else {
      await db.insert(notionConnections).values({
        userId,
        workspaceId: token.workspace_id,
        workspaceName: token.workspace_name,
        botId: token.bot_id,
        accessTokenEnc: new TextEncoder().encode(enc),
        direction: 'both',
        status: 'connected',
      });
    }
  }

  async function requireConnection(userId: string) {
    const conn = await getConnection(userId);
    if (!conn) throw new ApiError('not_found', 'No Notion connection', 404);
    return conn;
  }

  async function listDatabases(userId: string) {
    const conn = await requireConnection(userId);
    const token = await secretBox.open(new TextDecoder().decode(conn.accessTokenEnc));
    const dbs = await client(token).searchDatabases();
    return dbs.map((d) => ({
      databaseId: d.databaseId,
      dataSourceId: d.dataSourceId,
      title: d.title,
      compatible: isCompatible(d.properties),
    }));
  }

  async function createDatabase(userId: string, parentPageId: string, title: string) {
    const conn = await requireConnection(userId);
    const token = await secretBox.open(new TextDecoder().decode(conn.accessTokenEnc));
    return await client(token).createDatabase(parentPageId, title);
  }

  /** PUT /notion/connection: reconnecting to the same table resumes links; to a different
   * table clears the cursor (full reconcile) and every existing notion_page_id (they no
   * longer point at pages in the new database). */
  async function setConnection(
    userId: string,
    input: {
      databaseId: string;
      dataSourceId: string;
      direction: 'to_notion' | 'from_notion' | 'both';
    },
  ) {
    const conn = await requireConnection(userId);
    const changingDatabase = conn.databaseId !== null && conn.databaseId !== input.databaseId;
    const isFirstConnection = conn.databaseId === null;

    await db
      .update(notionConnections)
      .set({
        databaseId: input.databaseId,
        dataSourceId: input.dataSourceId,
        direction: input.direction,
        cursor: changingDatabase ? null : conn.cursor,
        status: 'connected',
        lastError: null,
        updatedAt: clock.now(),
      })
      .where(eq(notionConnections.userId, userId));

    if (changingDatabase) {
      // The previous database's page ids no longer correspond to anything in the new one.
      await db
        .update(expensesTable)
        .set({ notionPageId: null, notionLastEditedAt: null })
        .where(eq(expensesTable.userId, userId));
    }

    if (isFirstConnection && enqueue) {
      await enqueue('notion.sync', { userId }, { userId });
    }
  }

  /** DELETE /notion/connection: keeps the row and every expense's notion_page_id, only stops
   * syncing and drops the secret. */
  async function disconnectConnection(userId: string): Promise<void> {
    await requireConnection(userId);
    await db
      .update(notionConnections)
      .set({
        status: 'disconnected',
        accessTokenEnc: new Uint8Array(),
        updatedAt: clock.now(),
      })
      .where(eq(notionConnections.userId, userId));
  }

  async function loadLocalRows(userId: string): Promise<LocalRow[]> {
    const [rows, cats] = await Promise.all([
      db.select().from(expensesTable).where(eq(expensesTable.userId, userId)),
      db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId)),
    ]);
    const catNameById = new Map(cats.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id,
      notionPageId: r.notionPageId,
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      description: r.description,
      amountOriginal: r.amountOriginal,
      currencyOriginal: r.currencyOriginal,
      expenseDate: r.expenseDate,
      categoryName: r.categoryId ? (catNameById.get(r.categoryId) ?? null) : null,
      paidWith: r.paidWith,
      kind: r.kind,
      notes: r.notes,
      addedVia: r.addedVia,
    }));
  }

  async function writeVersion(
    expenseId: string,
    userId: string,
    source: 'app' | 'notion' | 'sync_conflict',
    snapshot: unknown,
    editedAt: string,
  ): Promise<void> {
    await db.insert(expenseVersions).values({
      expenseId,
      userId,
      source,
      snapshot,
      editedAt: new Date(editedAt),
    });
  }

  /** The core sync operation: loads the connection, decrypts the token, queries the data
   * source, diffs against local rows, applies both directions, writes versions, updates
   * connection status/cursor. */
  async function applySync(userId: string): Promise<{
    status: 'connected' | 'error';
    applied: number;
    skipped: number;
    conflicts: number;
  }> {
    const conn = await requireConnection(userId);
    if (conn.status === 'disconnected' || !conn.databaseId || !conn.dataSourceId) {
      return {
        status: conn.status === 'error' ? 'error' : 'connected',
        applied: 0,
        skipped: 0,
        conflicts: 0,
      };
    }

    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const defaultCurrency = user?.defaultCurrency ?? 'GBP';
      const token = await secretBox.open(new TextDecoder().decode(conn.accessTokenEnc));
      const notion = client(token);

      const remotePages: NotionPageResult[] = [];
      let cursor: string | undefined;
      do {
        const page = await notion.queryDataSource(conn.dataSourceId, cursor);
        remotePages.push(...page.results);
        cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
      } while (cursor);

      const remoteRows = remotePages
        .filter((p) => !p.archived)
        .map((p) => fromNotionProperties(p as unknown as NotionPage))
        .map((r) => (r.ok ? r.row : { invalid: true as const, reason: r.reason, raw: r }));

      const localRows = await loadLocalRows(userId);
      const result = diff(
        localRows,
        remoteRows,
        conn.cursor ? { lastSyncAt: conn.cursor.toISOString() } : null,
        conn.direction as 'to_notion' | 'from_notion' | 'both',
      );

      let applied = 0;

      for (const entry of result.toNotion) {
        const props = toNotionProperties({
          ...entry.row,
          addedVia: ADDED_VIA_TO_NOTION[entry.row.addedVia] ?? 'Dashboard',
        });
        if (entry.op === 'create') {
          const page = await notion.createPage(conn.dataSourceId, props);
          await db
            .update(expensesTable)
            .set({ notionPageId: page.id, notionLastEditedAt: new Date(page.last_edited_time) })
            .where(eq(expensesTable.id, entry.row.id));
          await writeVersion(entry.row.id, userId, 'app', props, page.last_edited_time);
        } else if (entry.op === 'update' && entry.row.notionPageId) {
          const page = await notion.updatePage(entry.row.notionPageId, props);
          await db
            .update(expensesTable)
            .set({ notionLastEditedAt: new Date(page.last_edited_time) })
            .where(eq(expensesTable.id, entry.row.id));
          await writeVersion(entry.row.id, userId, 'app', props, page.last_edited_time);
        } else if (entry.op === 'archive' && entry.row.notionPageId) {
          await notion.archivePage(entry.row.notionPageId);
        }
        applied += 1;
      }

      for (const entry of result.toLocal) {
        if (entry.op === 'create') {
          const category = entry.row.categoryName
            ? (
                await db
                  .select()
                  .from(categoriesTable)
                  .where(
                    and(
                      eq(categoriesTable.userId, userId),
                      eq(categoriesTable.name, entry.row.categoryName),
                    ),
                  )
                  .limit(1)
              )[0]
            : undefined;
          const { expense } = await expensesService.create(
            userId,
            defaultCurrency,
            {
              description: entry.row.description,
              amount: { minor: entry.row.amountOriginal, currency: entry.row.currencyOriginal },
              date: entry.row.expenseDate,
              categoryId: category?.id ?? null,
              paidWith: entry.row.paidWith as 'card' | 'cash' | 'bank_transfer' | 'other',
              kind: entry.row.kind as 'fixed' | 'variable' | 'one_off',
              notes: entry.row.notes ?? undefined,
            },
            'notion',
          );
          await db
            .update(expensesTable)
            .set({
              notionPageId: entry.row.pageId,
              notionLastEditedAt: new Date(entry.row.lastEditedTime),
            })
            .where(eq(expensesTable.id, expense.id));
          await writeVersion(expense.id, userId, 'notion', entry.row, entry.row.lastEditedTime);
        } else {
          const [local] = await db
            .select()
            .from(expensesTable)
            .where(
              and(
                eq(expensesTable.userId, userId),
                eq(expensesTable.notionPageId, entry.row.pageId),
              ),
            )
            .limit(1);
          if (!local) continue;
          if (entry.op === 'delete') {
            await db
              .update(expensesTable)
              .set({ deletedAt: clock.now() })
              .where(eq(expensesTable.id, local.id));
          } else {
            // Route through the expenses service's own patch() instead of a raw column update:
            // that's what recomputes amountDefault against the new amount/currency/date — a
            // direct db.update() left it stale, so an edit made in Notion silently corrupted
            // the default-currency total until the next unrelated re-save. Also resolves the
            // category name (previously ignored entirely on a Notion-side edit).
            const category = entry.row.categoryName
              ? (
                  await db
                    .select()
                    .from(categoriesTable)
                    .where(
                      and(
                        eq(categoriesTable.userId, userId),
                        eq(categoriesTable.name, entry.row.categoryName),
                      ),
                    )
                    .limit(1)
                )[0]
              : undefined;
            await expensesService.patch(userId, defaultCurrency, local.id, {
              description: entry.row.description,
              amount: { minor: entry.row.amountOriginal, currency: entry.row.currencyOriginal },
              date: entry.row.expenseDate,
              categoryId: entry.row.categoryName ? (category?.id ?? null) : undefined,
              paidWith: entry.row.paidWith as 'card' | 'cash' | 'bank_transfer' | 'other',
              kind: entry.row.kind as 'fixed' | 'variable' | 'one_off',
              notes: entry.row.notes,
            });
            await db
              .update(expensesTable)
              .set({ notionLastEditedAt: new Date(entry.row.lastEditedTime) })
              .where(eq(expensesTable.id, local.id));
          }
          await writeVersion(local.id, userId, 'notion', entry.row, entry.row.lastEditedTime);
        }
        applied += 1;
      }

      for (const c of result.conflicts) {
        await writeVersion(
          c.local.id,
          userId,
          'sync_conflict',
          { local: c.local },
          c.local.updatedAt,
        );
        await writeVersion(
          c.local.id,
          userId,
          'sync_conflict',
          { remote: c.remote },
          c.remote.lastEditedTime,
        );
      }

      await db
        .update(notionConnections)
        .set({ status: 'connected', lastError: null, lastSyncAt: clock.now(), cursor: clock.now() })
        .where(eq(notionConnections.userId, userId));

      return {
        status: 'connected',
        applied,
        skipped: result.skipped.length,
        conflicts: result.conflicts.length,
      };
    } catch (err) {
      const message =
        err instanceof NotionAuthError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      await db
        .update(notionConnections)
        .set({ status: 'error', lastError: message, lastSyncAt: clock.now() })
        .where(eq(notionConnections.userId, userId));
      return { status: 'error', applied: 0, skipped: 0, conflicts: 0 };
    }
  }

  /** POST /notion/sync: manual sync-now, debounced 10s per user — a repeat call within the
   * window is a no-op that returns the connection's current (unchanged) status rather than
   * re-hitting Notion. */
  async function syncNow(userId: string): Promise<{
    status: 'connected' | 'error' | 'disconnected';
    applied: number;
    skipped: number;
    conflicts: number;
    lastSyncAt: Date | null;
    lastError: string | null;
    debounced: boolean;
  }> {
    const now = clock.now().getTime();
    const last = lastSyncRequestAt.get(userId) ?? 0;
    if (now - last < DEBOUNCE_MS) {
      const conn = await requireConnection(userId);
      return {
        status: conn.status as 'connected' | 'error' | 'disconnected',
        applied: 0,
        skipped: 0,
        conflicts: 0,
        lastSyncAt: conn.lastSyncAt,
        lastError: conn.lastError,
        debounced: true,
      };
    }
    lastSyncRequestAt.set(userId, now);
    const result = await applySync(userId);
    const conn = await requireConnection(userId);
    return { ...result, lastSyncAt: conn.lastSyncAt, lastError: conn.lastError, debounced: false };
  }

  async function listVersions(userId: string, expenseId: string) {
    const [expense] = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.id, expenseId))
      .limit(1);
    if (!expense || expense.userId !== userId) {
      throw new ApiError('not_found', 'Expense not found', 404);
    }
    return db
      .select()
      .from(expenseVersions)
      .where(and(eq(expenseVersions.expenseId, expenseId), eq(expenseVersions.userId, userId)))
      .orderBy(expenseVersions.createdAt);
  }

  return {
    authorizeUrl,
    exchangeCode,
    connect,
    getConnection,
    listDatabases,
    createDatabase,
    setConnection,
    disconnectConnection,
    applySync,
    syncNow,
    triggerSyncSoon,
    listVersions,
  };
}

export type NotionService = ReturnType<typeof createNotionService>;
