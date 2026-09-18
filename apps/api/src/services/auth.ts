import { eq } from 'drizzle-orm';
import type { Db, users } from '@desk/db';
import { emailTokens, auditLog } from '@desk/db';
import type { PasswordHasher } from '../adapters/password.js';
import type { SessionStore, Session } from '../adapters/session-store.js';
import type { Mailer } from '../adapters/mailer.js';
import type { BreachChecker } from '../adapters/breach-checker.js';
import type { Clock } from '../app.js';
import { ApiError } from '../lib/api-error.js';
import { verifyMail } from '../mail/verify.js';
import { resetMail } from '../mail/reset.js';
import { seedDefaultCategories } from './categories.js';

type UserRow = typeof users.$inferSelect;

export type AuthDeps = {
  db: Db;
  hasher: PasswordHasher;
  sessions: SessionStore;
  mailer: Mailer;
  breachChecker: BreachChecker;
  clock: Clock;
};

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 20 * 60 * 1000;

/** Base origin for links in mail — a real APP_ORIGIN wiring is a small follow-up (ponytail). */
const LINK_ORIGIN = 'https://app.desk.invalid';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}

async function writeAudit(
  deps: AuthDeps,
  input: { userId: string | null; actor: string; action: string; subject: string },
): Promise<void> {
  await deps.db.insert(auditLog).values({
    userId: input.userId,
    actor: input.actor,
    action: input.action,
    subject: input.subject,
  });
}

export async function register(
  deps: AuthDeps,
  input: { email: string; password: string; defaultCurrency: string; timeZone: string },
): Promise<void> {
  const breached = await deps.breachChecker.check(input.password);
  if (breached) {
    throw new ApiError('validation_failed', 'This password has appeared in a data breach', 400, {
      password: 'breached',
    });
  }

  const [existing] = await deps.db
    .select()
    .from((await import('@desk/db')).users)
    .where(eq((await import('@desk/db')).users.email, input.email))
    .limit(1);
  if (existing) {
    // Always 202 — do not reveal that the email already has an account.
    return;
  }

  const { users: usersTable } = await import('@desk/db');
  const passwordHash = await deps.hasher.hash(input.password);
  const [user] = await deps.db
    .insert(usersTable)
    .values({
      email: input.email,
      passwordHash,
      defaultCurrency: input.defaultCurrency,
      timeZone: input.timeZone,
    })
    .returning();
  if (!user) throw new Error('register: insert returned no row');

  await seedDefaultCategories(deps.db, user.id);
  await sendVerifyMail(deps, user);
  await writeAudit(deps, { userId: user.id, actor: user.id, action: 'register', subject: user.id });
}

async function sendVerifyMail(deps: AuthDeps, user: UserRow): Promise<void> {
  const token = newToken();
  const tokenHash = await hashToken(token);
  const now = deps.clock.now();
  await deps.db.insert(emailTokens).values({
    userId: user.id,
    purpose: 'verify',
    tokenHash,
    expiresAt: new Date(now.getTime() + VERIFY_TOKEN_TTL_MS),
  });
  const link = `${LINK_ORIGIN}/verify?token=${encodeURIComponent(token)}`;
  const mail = verifyMail(link);
  await deps.mailer.send({ to: user.email, subject: mail.subject, html: mail.html });
}

async function consumeEmailToken(
  deps: AuthDeps,
  token: string,
  purpose: 'verify' | 'reset',
): Promise<{ id: string; userId: string }> {
  const tokenHash = await hashToken(token);
  const [row] = await deps.db
    .select()
    .from(emailTokens)
    .where(eq(emailTokens.tokenHash, tokenHash))
    .limit(1);
  const now = deps.clock.now();
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() < now.getTime()) {
    throw new ApiError('not_found', 'This link is invalid or has expired', 404);
  }
  await deps.db.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, row.id));
  return { id: row.id, userId: row.userId };
}

async function createSessionFor(
  deps: AuthDeps,
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<{ token: string; session: Session }> {
  const token = newToken();
  const tokenHash = await hashToken(token);
  const session = await deps.sessions.create({
    userId,
    tokenHash,
    userAgent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
  });
  return { token, session };
}

export async function verify(
  deps: AuthDeps,
  input: { token: string },
): Promise<{ user: UserRow; sessionToken: string }> {
  const { userId } = await consumeEmailToken(deps, input.token, 'verify');
  const { users: usersTable } = await import('@desk/db');
  const now = deps.clock.now();
  await deps.db.update(usersTable).set({ emailVerifiedAt: now }).where(eq(usersTable.id, userId));
  const [user] = await deps.db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new Error('verify: user not found after update');

  const { token: sessionToken } = await createSessionFor(deps, userId);
  await writeAudit(deps, { userId, actor: userId, action: 'verify', subject: userId });
  return { user, sessionToken };
}

export async function login(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<{ user: UserRow; sessionToken: string }> {
  const { users: usersTable } = await import('@desk/db');
  const [user] = await deps.db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, input.email))
    .limit(1);

  if (!user || !user.passwordHash) {
    // Constant-shape failure: don't leak whether the email exists.
    throw new ApiError('unauthenticated', 'Invalid email or password', 401);
  }

  const ok = await deps.hasher.verify(input.password, user.passwordHash);
  if (!ok) {
    throw new ApiError('unauthenticated', 'Invalid email or password', 401);
  }

  if (deps.hasher.needsRehash(user.passwordHash)) {
    const rehashed = await deps.hasher.hash(input.password);
    await deps.db
      .update(usersTable)
      .set({ passwordHash: rehashed })
      .where(eq(usersTable.id, user.id));
  }

  const { token: sessionToken } = await createSessionFor(deps, user.id);
  await writeAudit(deps, { userId: user.id, actor: user.id, action: 'login', subject: user.id });
  return { user, sessionToken };
}

export async function logout(
  deps: AuthDeps,
  tokenHash: string,
  userId: string | null,
): Promise<void> {
  await deps.sessions.revoke(tokenHash);
  await writeAudit(deps, {
    userId,
    actor: userId ?? 'unknown',
    action: 'logout',
    subject: userId ?? 'unknown',
  });
}

export async function forgotPassword(deps: AuthDeps, input: { email: string }): Promise<void> {
  const { users: usersTable } = await import('@desk/db');
  const [user] = await deps.db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, input.email))
    .limit(1);
  if (!user) return; // always 202, no enumeration

  const token = newToken();
  const tokenHash = await hashToken(token);
  const now = deps.clock.now();
  await deps.db.insert(emailTokens).values({
    userId: user.id,
    purpose: 'reset',
    tokenHash,
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  });
  const link = `${LINK_ORIGIN}/reset?token=${encodeURIComponent(token)}`;
  const mail = resetMail(link);
  await deps.mailer.send({ to: user.email, subject: mail.subject, html: mail.html });
  await writeAudit(deps, {
    userId: user.id,
    actor: user.id,
    action: 'password.forgot',
    subject: user.id,
  });
}

export async function resetPassword(
  deps: AuthDeps,
  input: { token: string; password: string },
): Promise<void> {
  const breached = await deps.breachChecker.check(input.password);
  if (breached) {
    throw new ApiError('validation_failed', 'This password has appeared in a data breach', 400, {
      password: 'breached',
    });
  }

  const { userId } = await consumeEmailToken(deps, input.token, 'reset');
  const { users: usersTable } = await import('@desk/db');
  const passwordHash = await deps.hasher.hash(input.password);
  await deps.db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
  // Fresh reset: revoke every session, including whichever one the requester currently holds.
  await deps.sessions.revokeAllExcept(userId, '');
  await writeAudit(deps, { userId, actor: userId, action: 'password.reset', subject: userId });
}
