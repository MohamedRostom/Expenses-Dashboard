import { Hono } from 'hono';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  users as usersTable,
  sessions as sessionsTable,
  emailTokens,
  oauthAccounts,
  jobs as jobsTable,
  auditLog,
  type Db,
} from '@desk/db';
import {
  MeResponse,
  PatchMeRequest,
  ChangeEmailRequest,
  ConfirmEmailRequest,
  DeleteMeRequest,
  type MeResponseT,
  type PatchMeResponseT,
  type SessionsResponseT,
  type ExportDocumentT,
  type ConfirmEmailResponseT,
} from '@desk/contracts';
import type { AppVariables } from '../app.js';
import type { SessionUser } from '../middleware/session.js';
import type { PasswordHasher } from '../adapters/password.js';
import type { Mailer } from '../adapters/mailer.js';
import type { SessionStore } from '../adapters/session-store.js';
import { requireAuth } from '../lib/require-auth.js';
import { ApiError } from '../lib/api-error.js';

export type MeRoutesDeps = {
  db: Db;
  hasher: PasswordHasher;
  mailer: Mailer;
  sessionStore: SessionStore;
  clock: { now(): Date };
};

function toUserResponse(u: SessionUser): MeResponseT['user'] {
  return {
    id: u.id,
    email: u.email,
    defaultCurrency: u.defaultCurrency,
    theme: u.theme,
    timeZone: u.timeZone,
    onboardingCompletedAt: u.onboardingCompletedAt ? u.onboardingCompletedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EMAIL_CHANGE_PREFIX = 'email_change:';

/** GET/PATCH /me, /me/sessions, /me/export, DELETE /me, /me/email(/confirm), password/oauth removal. */
export function createMeRoutes(deps: MeRoutesDeps) {
  const { db, hasher, mailer, sessionStore, clock } = deps;
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/me', (c) => {
    const user = requireAuth(c);
    const body: MeResponseT = MeResponse.parse({ user: toUserResponse(user) });
    return c.json(body);
  });

  app.patch('/me', async (c) => {
    const user = requireAuth(c);
    const patchBody = PatchMeRequest.parse(await c.req.json());

    const patch: Partial<typeof usersTable.$inferInsert> = {};
    if (patchBody.theme !== undefined) patch.theme = patchBody.theme;
    if (patchBody.timeZone !== undefined) patch.timeZone = patchBody.timeZone;
    if (patchBody.onboardingCompletedAt !== undefined) {
      patch.onboardingCompletedAt = patchBody.onboardingCompletedAt
        ? new Date(patchBody.onboardingCompletedAt)
        : null;
    }

    let jobId: string | undefined;
    if (patchBody.defaultCurrency && patchBody.defaultCurrency !== user.defaultCurrency) {
      patch.defaultCurrency = patchBody.defaultCurrency;

      // Dedupe: a currency.change already queued/running for this user wins — the UI shows one
      // progress indicator, so a second request surfaces the running job's id instead of racing it.
      const [existing] = await db
        .select()
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.userId, user.id),
            eq(jobsTable.name, 'currency.change'),
            inArray(jobsTable.status, ['queued', 'running']),
          ),
        )
        .limit(1);

      if (existing) {
        jobId = existing.id;
      } else {
        const [inserted] = await db
          .insert(jobsTable)
          .values({
            name: 'currency.change',
            userId: user.id,
            payload: {
              userId: user.id,
              fromCurrency: user.defaultCurrency,
              toCurrency: patchBody.defaultCurrency,
              changeDate: clock.now().toISOString().slice(0, 10),
            },
          })
          .returning();
        jobId = inserted?.id;
      }
    }

    let updated = user;
    if (Object.keys(patch).length > 0) {
      const [row] = await db
        .update(usersTable)
        .set(patch)
        .where(eq(usersTable.id, user.id))
        .returning();
      if (row) updated = row;
    }

    const body: PatchMeResponseT = {
      user: toUserResponse(updated),
      ...(jobId ? { job: { id: jobId } } : {}),
    };
    return c.json(body);
  });

  app.get('/me/sessions', async (c) => {
    const user = requireAuth(c);
    const currentSession = c.get('session');
    const now = clock.now();

    const rows = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.userId, user.id), isNull(sessionsTable.revokedAt)));

    const body: SessionsResponseT = {
      sessions: rows
        .filter((r) => r.expiresAt > now)
        .map((r) => ({
          id: r.id,
          current: currentSession?.id === r.id,
          lastSeenAt: r.lastSeenAt.toISOString(),
          userAgent: r.userAgent,
        })),
    };
    return c.json(body);
  });

  app.delete('/me/sessions/:id', async (c) => {
    const user = requireAuth(c);
    const id = c.req.param('id');
    const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).limit(1);
    if (!row || row.userId !== user.id) throw new ApiError('not_found', 'Session not found', 404);

    await db.update(sessionsTable).set({ revokedAt: new Date() }).where(eq(sessionsTable.id, id));
    return c.body(null, 204);
  });

  app.get('/me/export', (c) => {
    const user = requireAuth(c);

    // ponytail: categories/expenses/importBatches/notion tables don't exist yet (Phase 2/3) —
    // shape and streaming mechanism only; wire real queries in when those land.
    const doc: ExportDocumentT = {
      exportedAt: clock.now().toISOString(),
      user: toUserResponse(user),
      categories: [],
      expenses: [],
      importBatches: [],
      notion: { connected: false, direction: null, databaseId: null },
      version: 1,
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(doc)));
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'application/json' } });
  });

  app.delete('/me', async (c) => {
    const user = requireAuth(c);
    const raw = await c.req.json().catch(() => ({}));
    const body = DeleteMeRequest.parse(raw);

    if (user.passwordHash) {
      if (!body.password || !(await hasher.verify(body.password, user.passwordHash))) {
        throw new ApiError('validation_failed', 'Incorrect password', 400);
      }
    }

    // audit_log.user_id cascades on delete (see report) — pseudonymise with a one-way hash
    // before the user row goes, so the FK never fires against a row we still want to keep.
    const pseudonym = await sha256Hex(user.id);

    await db.transaction(async (tx) => {
      await tx
        .update(jobsTable)
        .set({ status: 'failed', error: 'cancelled', finishedAt: new Date() })
        .where(
          and(eq(jobsTable.userId, user.id), inArray(jobsTable.status, ['queued', 'running'])),
        );

      const auditRows = await tx.select().from(auditLog).where(eq(auditLog.userId, user.id));
      for (const row of auditRows) {
        await tx
          .update(auditLog)
          .set({
            userId: null,
            details: {
              ...(row.details as Record<string, unknown> | null),
              deletedUserHash: pseudonym,
            },
          })
          .where(eq(auditLog.id, row.id));
      }

      await tx.delete(usersTable).where(eq(usersTable.id, user.id));
    });

    return c.body(null, 204);
  });

  app.post('/me/email', async (c) => {
    const user = requireAuth(c);
    const body = ChangeEmailRequest.parse(await c.req.json());

    if (user.passwordHash && body.password) {
      const ok = await hasher.verify(body.password, user.passwordHash);
      if (!ok) throw new ApiError('validation_failed', 'Incorrect password', 400);
    }

    const token = crypto.randomUUID();
    const tokenHash = await sha256Hex(token);
    await db.insert(emailTokens).values({
      userId: user.id,
      purpose: `${EMAIL_CHANGE_PREFIX}${body.newEmail}`,
      tokenHash,
      expiresAt: new Date(clock.now().getTime() + 24 * 60 * 60 * 1000),
    });

    // ponytail: no shared mail-template module exists yet — inline copy here; fold into a
    // proper template if apps/api/src/mail/email-change.ts lands from a parallel task.
    const confirmUrl = `https://app.example/me/email/confirm?token=${token}`;
    await mailer.send({
      to: body.newEmail,
      subject: 'Confirm your new email address',
      html: `<p>Confirm your new email for Desk: <a href="${confirmUrl}">${confirmUrl}</a></p>`,
    });
    await mailer.send({
      to: user.email,
      subject: 'Your email is changing',
      html: `<p>Your account email is changing to ${body.newEmail}. Contact support if this wasn't you.</p>`,
    });

    return c.body(null, 202);
  });

  app.post('/me/email/confirm', async (c) => {
    const user = requireAuth(c);
    const body = ConfirmEmailRequest.parse(await c.req.json());
    const tokenHash = await sha256Hex(body.token);

    const [row] = await db
      .select()
      .from(emailTokens)
      .where(eq(emailTokens.tokenHash, tokenHash))
      .limit(1);
    if (
      !row ||
      row.userId !== user.id ||
      row.usedAt ||
      row.expiresAt < clock.now() ||
      !row.purpose.startsWith(EMAIL_CHANGE_PREFIX)
    ) {
      throw new ApiError('validation_failed', 'Invalid or expired token', 400);
    }
    const newEmail = row.purpose.slice(EMAIL_CHANGE_PREFIX.length);

    let updated = user;
    await db.transaction(async (tx) => {
      await tx.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, row.id));
      const [u] = await tx
        .update(usersTable)
        .set({ email: newEmail })
        .where(eq(usersTable.id, user.id))
        .returning();
      if (u) updated = u;
    });

    const currentSession = c.get('session');
    if (currentSession) await sessionStore.revokeAllExcept(user.id, currentSession.tokenHash);

    const respBody: ConfirmEmailResponseT = { user: toUserResponse(updated) };
    return c.json(respBody);
  });

  app.delete('/me/password', async (c) => {
    const user = requireAuth(c);
    const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
    if (links.length === 0) {
      throw new ApiError('conflict', 'Cannot remove your only sign-in method', 409);
    }
    await db.update(usersTable).set({ passwordHash: null }).where(eq(usersTable.id, user.id));
    return c.body(null, 204);
  });

  app.delete('/me/oauth/:provider', async (c) => {
    const user = requireAuth(c);
    const provider = c.req.param('provider');
    if (!user.passwordHash) {
      throw new ApiError('conflict', 'Cannot remove your only sign-in method', 409);
    }
    await db
      .delete(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, user.id), eq(oauthAccounts.provider, provider)));
    return c.body(null, 204);
  });

  return app;
}
