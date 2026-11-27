import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  NotionConnectOutcome,
  type NotionConnectOutcomeT,
  SetNotionConnectionRequest,
  CreateNotionDatabaseRequest,
  type NotionConnectionResponseT,
} from '@desk/contracts';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import { ApiError } from '../lib/api-error.js';
import type { NotionService } from '../services/notion.js';

// Value is `<state>.<userId>`. Secure always, like the other OAuth cookies (browsers treat
// http://localhost as secure for the Secure attribute, so compose works unchanged).
const OAUTH_STATE_COOKIE = '__Host-desk_notion_oauth';
const OAUTH_STATE_MAX_AGE_S = 600;

export type NotionRoutesDeps = { notion: NotionService; appOrigin: string };

function toConnectionResponse(row: {
  workspaceName: string;
  databaseId: string | null;
  dataSourceId: string | null;
  direction: string;
  status: string;
  lastSyncAt: Date | null;
  lastError: string | null;
}): NotionConnectionResponseT {
  return {
    workspaceName: row.workspaceName,
    databaseId: row.databaseId,
    dataSourceId: row.dataSourceId,
    direction: row.direction as NotionConnectionResponseT['direction'],
    status: row.status as NotionConnectionResponseT['status'],
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastError: row.lastError,
  };
}

/** /notion/start, /notion/callback, GET/PUT/DELETE /notion/connection, GET /notion/databases,
 * POST /notion/databases, POST /notion/sync, GET /expenses/:id/versions. */
export function createNotionRoutes(deps: NotionRoutesDeps) {
  const app = new Hono<{ Variables: AppVariables }>();
  // Must match the handler's actual mounted path below (app.get('/notion/callback', ...)) — this
  // used to say /auth/notion/callback, a path nothing serves, so Notion's OAuth redirect 404'd.
  const redirectUri = `${deps.appOrigin}/notion/callback`;

  app.get('/notion/start', (c) => {
    const user = c.get('user');
    if (!user) return c.redirect('/login?next=/settings/connectors', 302);
    const state = crypto.randomUUID();
    setCookie(c, OAUTH_STATE_COOKIE, `${state}.${user.id}`, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: OAUTH_STATE_MAX_AGE_S,
    });
    return c.redirect(deps.notion.authorizeUrl(state, redirectUri), 302);
  });

  const outcomeRedirect = (c: Context, outcome: NotionConnectOutcomeT) =>
    c.redirect(`/settings/connectors?notion=${NotionConnectOutcome.parse(outcome)}`, 302);

  // The one place a failed connect attempt lands; a later brief adds logging here.
  const failed = (c: Context) => outcomeRedirect(c, 'failed');

  app.get('/notion/callback', async (c) => {
    const user = c.get('user');
    const saved = getCookie(c, OAUTH_STATE_COOKIE);
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/', secure: true });

    const error = c.req.query('error');
    if (error === 'access_denied') return outcomeRedirect(c, 'denied');
    if (error) return failed(c);

    const [savedState, savedUserId] = saved?.split('.') ?? [];
    const returnedState = c.req.query('state');
    if (
      !user ||
      !savedState ||
      !returnedState ||
      savedState !== returnedState ||
      savedUserId !== user.id
    ) {
      return outcomeRedirect(c, 'expired');
    }

    try {
      const code = c.req.query('code');
      if (!code) return failed(c);
      const token = await deps.notion.exchangeCode(code, redirectUri);
      await deps.notion.connect(user.id, token);
      // The connection is stored from here on; the shared-pages check is advisory, so if it
      // fails the honest answer is still "connected" (sync surfaces any later problem).
      const shared = await deps.notion.hasSharedContent(token.access_token).catch(() => true);
      return outcomeRedirect(c, shared ? 'connected' : 'no_pages');
    } catch {
      return failed(c);
    }
  });

  app.get('/notion/connection', async (c) => {
    const user = requireAuth(c);
    const conn = await deps.notion.getConnection(user.id);
    if (!conn) throw new ApiError('not_found', 'No Notion connection', 404);
    return c.json({ connection: toConnectionResponse(conn) });
  });

  app.put('/notion/connection', async (c) => {
    const user = requireAuth(c);
    const input = SetNotionConnectionRequest.parse(await c.req.json());
    await deps.notion.setConnection(user.id, input);
    const conn = await deps.notion.getConnection(user.id);
    if (!conn) throw new ApiError('not_found', 'No Notion connection', 404);
    return c.json({ connection: toConnectionResponse(conn) });
  });

  app.delete('/notion/connection', async (c) => {
    const user = requireAuth(c);
    await deps.notion.disconnectConnection(user.id);
    return c.body(null, 204);
  });

  app.get('/notion/databases', async (c) => {
    const user = requireAuth(c);
    const databases = await deps.notion.listDatabases(user.id);
    return c.json({ databases });
  });

  app.post('/notion/databases', async (c) => {
    const user = requireAuth(c);
    const input = CreateNotionDatabaseRequest.parse(await c.req.json());
    const created = await deps.notion.createDatabase(user.id, input.parentPageId, input.title);
    return c.json({ database: created }, 201);
  });

  app.post('/notion/sync', async (c) => {
    const user = requireAuth(c);
    const result = await deps.notion.syncNow(user.id);
    return c.json({
      status: result.status,
      lastSyncAt: result.lastSyncAt ? result.lastSyncAt.toISOString() : null,
      lastError: result.lastError,
      applied: result.applied,
      skipped: result.skipped,
      conflicts: result.conflicts,
    });
  });

  app.get('/expenses/:id/versions', async (c) => {
    const user = requireAuth(c);
    const versions = await deps.notion.listVersions(user.id, c.req.param('id'));
    return c.json({
      versions: versions.map((v) => ({
        id: v.id,
        source: v.source,
        snapshot: v.snapshot,
        editedAt: v.editedAt.toISOString(),
        createdAt: v.createdAt.toISOString(),
      })),
    });
  });

  return app;
}
