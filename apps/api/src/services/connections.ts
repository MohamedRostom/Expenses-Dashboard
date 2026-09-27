import { and, eq } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { accountCalendars, auditLog, connectedAccounts } from '@desk/db';
import type { AccountPatchT, CapabilityT } from '@desk/contracts';
import type { CalendarSource } from '@desk/connectors/panels';
import type { SecretBox } from '../adapters/secret-box.js';
import { openCredential } from '../lib/credential.js';
import type { Clock } from '../app.js';

const COLOUR_PALETTE = [
  'teal',
  'blue',
  'violet',
  'pink',
  'orange',
  'amber',
  'green',
  'slate',
] as const;

export type AccountRow = typeof connectedAccounts.$inferSelect;

export type ConnectionsServiceDeps = {
  db: Db;
  secretBox: SecretBox;
  clock: Clock;
  /** Calendar sources per OAuth provider — used to revoke at the provider on disconnect. */
  calendarSources: Partial<Record<'google' | 'microsoft', CalendarSource>>;
  enqueue: (
    name: string,
    payload: unknown,
    opts?: { userId?: string; runAfter?: Date },
  ) => Promise<string>;
};

export class ConnectionsService {
  constructor(private deps: ConnectionsServiceDeps) {}

  /** Get the next unused colour from the palette for a user's accounts. */
  async getNextColour(userId: string): Promise<string> {
    const existing = await this.deps.db
      .select({ colour: connectedAccounts.colour })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, userId));

    const usedColours = new Set(existing.map((a) => a.colour).filter(Boolean));
    for (const colour of COLOUR_PALETTE) {
      if (!usedColours.has(colour)) return colour;
    }
    return COLOUR_PALETTE[0];
  }

  /** Check if a user is at the ten-account limit. If accountId is provided,
   * check against existing accounts to allow reconnecting. */
  async checkLimit(userId: string, accountId?: string): Promise<boolean> {
    const count = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, userId));

    if (accountId) {
      // If trying to add capability to an existing account, don't count it as a new one
      return count.length >= 10 && !count.some((a) => a.id === accountId);
    }
    return count.length >= 10;
  }

  /** Seal a credential (refresh token) with SecretBox. */
  async sealCredential(credential: string): Promise<string> {
    return this.deps.secretBox.seal(credential);
  }

  /** Get the current time. */
  now(): Date {
    return this.deps.clock.now();
  }

  private async ownedAccount(userId: string, accountId: string): Promise<AccountRow> {
    const [account] = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, userId)));
    if (!account) throw new Error('not_found');
    return account;
  }

  private async audit(
    userId: string,
    action: string,
    subject: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.db.insert(auditLog).values({
      userId,
      actor: 'user',
      action,
      subject,
      ...(details && { details }),
    });
  }

  /** Applies label/colour/paused/calendars per data-model.md transitions; throws not_found
   * unless the account exists and belongs to the user. */
  async update(userId: string, accountId: string, patch: AccountPatchT): Promise<AccountRow> {
    const account = await this.ownedAccount(userId, accountId);

    const set: Partial<typeof connectedAccounts.$inferInsert> = { updatedAt: this.now() };
    if (patch.label !== undefined) set.label = patch.label;
    if (patch.colour !== undefined) set.colour = patch.colour;

    if (patch.paused === true && !account.pausedAt) {
      set.pausedAt = this.now();
    } else if (patch.paused === false && account.pausedAt) {
      set.pausedAt = null;
      // Resume marks the account due (data-model.md); the stored status is untouched, so a
      // paused reconnect_needed account resumes as reconnect_needed.
      set.nextRefreshAt = this.now();
    }

    let updated = account;
    if (Object.keys(set).length > 1) {
      const [row] = await this.deps.db
        .update(connectedAccounts)
        .set(set)
        .where(eq(connectedAccounts.id, accountId))
        .returning();
      if (row) updated = row;
    }

    // data-model.md's audit_log entries are connect, reconnect, pause, disconnect, revoke
    // failures, purge — resume isn't audited.
    if (set.pausedAt) {
      await this.audit(userId, 'pause', accountId);
    }

    if (patch.calendars) {
      await this.setCalendars(userId, accountId, patch.calendars);
    }

    return updated;
  }

  async pause(userId: string, accountId: string): Promise<AccountRow> {
    return this.update(userId, accountId, { paused: true });
  }

  async resume(userId: string, accountId: string): Promise<AccountRow> {
    return this.update(userId, accountId, { paused: false });
  }

  /** Toggles account_calendars.enabled for the given ids (scoped to this account) and enqueues
   * a refresh when any calendar transitions to enabled. */
  async setCalendars(
    userId: string,
    accountId: string,
    calendars: Array<{ id: string; enabled: boolean }>,
  ): Promise<void> {
    let anyNewlyEnabled = false;
    for (const cal of calendars) {
      const [existing] = await this.deps.db
        .select()
        .from(accountCalendars)
        .where(and(eq(accountCalendars.id, cal.id), eq(accountCalendars.accountId, accountId)));
      if (!existing) continue;
      if (cal.enabled && !existing.enabled) anyNewlyEnabled = true;
      await this.deps.db
        .update(accountCalendars)
        .set({ enabled: cal.enabled, updatedAt: this.now() })
        .where(eq(accountCalendars.id, cal.id));
    }
    if (anyNewlyEnabled) {
      await this.deps.enqueue('panels.refresh', { accountId }, { userId });
    }
  }

  /** Ownership-checked lookup for the reconnect flow; audits the attempt. Throws not_found
   * unless the account exists and belongs to the user. */
  async startReconnect(
    userId: string,
    accountId: string,
  ): Promise<{ provider: string; capabilities: CapabilityT[] }> {
    const account = await this.ownedAccount(userId, accountId);
    await this.audit(userId, 'reconnect', accountId);
    return { provider: account.provider, capabilities: account.capabilities as CapabilityT[] };
  }

  /** Revokes at the provider (best effort, audited on failure — never blocks the delete), then
   * deletes the row; calendars/events/messages cascade via their FKs. Throws not_found unless
   * the account exists and belongs to the user. */
  async disconnect(userId: string, accountId: string): Promise<void> {
    const account = await this.ownedAccount(userId, accountId);
    await this.revokeOne(userId, account);
    await this.audit(userId, 'disconnect', accountId);
    await this.deps.db.delete(connectedAccounts).where(eq(connectedAccounts.id, accountId));
  }

  /** Revokes every connected account for a user at its provider, best effort, audited on
   * failure. Called from DELETE /me before the user cascade deletes the rows. */
  async revokeAllForUser(userId: string): Promise<void> {
    const accounts = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, userId));
    for (const account of accounts) {
      await this.revokeOne(userId, account);
    }
  }

  private async revokeOne(userId: string, account: AccountRow): Promise<void> {
    const source = this.deps.calendarSources[account.provider as 'google' | 'microsoft'];
    if (!source) return;
    try {
      const credential = await openCredential(this.deps.secretBox, account.credentialEnc);
      await source.revoke(credential);
    } catch (error) {
      await this.audit(userId, 'revoke_failure', account.id, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
