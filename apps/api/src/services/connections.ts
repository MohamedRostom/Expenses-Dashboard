import { and, eq } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { accountCalendars, auditLog, connectedAccounts } from '@desk/db';
import type { AccountPatchT, CapabilityT, StandardsCreateT } from '@desk/contracts';
import type { CalendarSource, MailSource } from '@desk/connectors/panels';
import { VerificationError } from '@desk/connectors/panels';
import type { SecretBox } from '../adapters/secret-box.js';
import { openCredential, sealCredential, type StandardsCredential } from '../lib/credential.js';
import type { Clock } from '../app.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';
import type { HostResolver } from '../lib/host-policy.js';
import { isPublicAddress } from '../lib/host-policy.js';
import { ApiError } from '../lib/api-error.js';

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
  /** Calendar sources per provider — used to revoke at the provider on disconnect (google,
   * microsoft) and to verify a standards CalDAV connection (T070). */
  calendarSources: Partial<Record<'google' | 'microsoft' | 'standards', CalendarSource>>;
  /** Mail sources per provider — only 'standards' (IMAP) is used here, to verify a standards
   * mail connection (T070); google/microsoft never reach createStandards. */
  mailSources: Partial<Record<'google' | 'microsoft' | 'standards', MailSource>>;
  enqueue: (
    name: string,
    payload: unknown,
    opts?: { userId?: string; runAfter?: Date },
  ) => Promise<string>;
  /** T070/FR-017: five attempts per user and per IP in ten minutes on createStandards. */
  limiter: RateLimiter;
  /** T070/FR-017: resolves a hostname (or IP literal) to the addresses it answers to, so
   * createStandards can refuse non-public ones without opening a socket. Node wires
   * adapters/host-resolver-node.ts; Workers has none yet (createStandards throws until it does). */
  hostResolver: HostResolver;
  /** STANDARDS_ALLOW_PRIVATE_HOSTS (env.ts) — bypasses only the public-address check below, so
   * e2e-ci can reach the compose `mocks` service at its private Docker address. Off by default,
   * refused outright in production (env.ts). Never bypasses the port/scheme checks. */
  allowPrivateHosts: boolean;
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
    const source =
      this.deps.calendarSources[account.provider as 'google' | 'microsoft' | 'standards'];
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

  /** FR-017: refuses non-https CalDAV, non-993/143 IMAP, and any host (literal or resolved) that
   * isn't a public internet address — before opening a socket, per capability actually
   * requested (FR-018). Throws ApiError(422) either way.
   *
   * `allowPrivateHosts` (STANDARDS_ALLOW_PRIVATE_HOSTS, e2e-ci only) also lifts the CalDAV
   * https-only rule: the compose CalDAV mock is served over plain http at the same private
   * Docker address the flag already allows connecting to, and there is no separate "scheme"
   * knob to ask for — the port/993/143 rule for IMAP is unaffected either way. */
  private async assertHostPolicy(
    capabilities: CapabilityT[],
    imapHost: string | undefined,
    imapPort: number | undefined,
    caldavUrl: string | undefined,
  ): Promise<void> {
    if (capabilities.includes('mail')) {
      if (!imapHost || imapPort === undefined) {
        throw new ApiError('validation_failed', 'imapHost and imapPort are required for mail', 400);
      }
      if (imapPort !== 993 && imapPort !== 143) {
        throw new ApiError('host_not_allowed', 'IMAP port must be 993 or 143', 422);
      }
      await this.assertPublicHost(imapHost);
    }
    if (capabilities.includes('calendar')) {
      if (!caldavUrl) {
        throw new ApiError('validation_failed', 'caldavUrl is required for calendar', 400);
      }
      let parsed: URL;
      try {
        parsed = new URL(caldavUrl);
      } catch {
        throw new ApiError('host_not_allowed', 'Invalid CalDAV URL', 422);
      }
      if (
        parsed.protocol !== 'https:' &&
        !(this.deps.allowPrivateHosts && parsed.protocol === 'http:')
      ) {
        throw new ApiError('host_not_allowed', 'CalDAV URL must use https', 422);
      }
      await this.assertPublicHost(parsed.hostname);
    }
  }

  private async assertPublicHost(hostname: string): Promise<void> {
    if (this.deps.allowPrivateHosts) return;
    let addresses: string[];
    try {
      addresses = await this.deps.hostResolver(hostname);
    } catch {
      throw new ApiError('host_not_allowed', 'Could not resolve host', 422);
    }
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a))) {
      throw new ApiError('host_not_allowed', 'Host is not a public address', 422);
    }
  }

  /** Verifies the requested capabilities against the standards mail/calendar sources, mapping a
   * VerificationError's step straight through (FR-017/FR-018); throws ApiError(422,
   * 'verification_failed', { step }) either way. */
  private async verifyStandards(
    capabilities: CapabilityT[],
    address: string,
    password: string,
    imapHost: string | undefined,
    imapPort: number | undefined,
    caldavUrl: string | undefined,
  ): Promise<void> {
    if (capabilities.includes('mail')) {
      const source = this.deps.mailSources.standards;
      if (!source) throw new Error('createStandards: no standards mail source configured');
      try {
        await source.verify({
          host: imapHost,
          port: imapPort,
          tls: imapPort === 993,
          username: address,
          password,
        });
      } catch (err) {
        if (err instanceof VerificationError) {
          throw new ApiError('verification_failed', err.message, 422, { step: err.step });
        }
        throw new ApiError('verification_failed', 'IMAP verification failed', 422, {
          step: 'connect',
        });
      }
    }
    if (capabilities.includes('calendar')) {
      const source = this.deps.calendarSources.standards;
      if (!source) throw new Error('createStandards: no standards calendar source configured');
      try {
        await source.verify({ url: caldavUrl, username: address, password });
      } catch (err) {
        if (err instanceof VerificationError) {
          throw new ApiError('verification_failed', err.message, 422, { step: err.step });
        }
        throw new ApiError('verification_failed', 'CalDAV verification failed', 422, {
          step: 'discovery',
        });
      }
    }
  }

  /** POST /connections/standards (T070). FR-017 host/port/scheme check first (no socket opened
   * on refusal), then the per-user/per-IP rate limit, then the ten-account limit (skipped when
   * the address merges into an existing standards row), then verification per requested
   * capability, then seal + save. An existing `(user, 'standards', address)` merges capabilities
   * and replaces the credential — the web client's reconnect flow re-POSTs here with the new
   * password and the account's existing capabilities rather than calling a separate reconnect
   * endpoint, so this is also how a rejected app password gets fixed (FR-018); the merge branch
   * audits 'reconnect', a brand new row audits 'connect'. */
  async createStandards(userId: string, body: StandardsCreateT, ip: string): Promise<AccountRow> {
    const TEN_MIN = 10 * 60 * 1000;
    const userOk = await this.deps.limiter.hit(`standards:user:${userId}`, 5, TEN_MIN);
    const ipOk = await this.deps.limiter.hit(`standards:ip:${ip}`, 5, TEN_MIN);
    if (!userOk || !ipOk) {
      throw new ApiError('rate_limited', 'Too many attempts', 429);
    }

    const address = body.address.toLowerCase();

    const [existingRow] = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, userId),
          eq(connectedAccounts.provider, 'standards'),
          eq(connectedAccounts.address, address),
        ),
      );

    if (!existingRow) {
      const atLimit = await this.checkLimit(userId);
      if (atLimit) throw new ApiError('limit_reached', 'Maximum 10 accounts', 409);
    }

    // A reconnect (the web form's reconnect mode) sends only the new password: server details it
    // omits carry over from the stored credential, so a merge never drops them.
    const stored = existingRow
      ? await openCredential<StandardsCredential>(this.deps.secretBox, existingRow.credentialEnc)
      : undefined;
    const imapHost = body.imapHost ?? stored?.imapHost;
    const imapPort = body.imapPort ?? stored?.imapPort;
    const caldavUrl = body.caldavUrl ?? stored?.caldavUrl;

    await this.assertHostPolicy(body.capabilities, imapHost, imapPort, caldavUrl);
    await this.verifyStandards(
      body.capabilities,
      address,
      body.password,
      imapHost,
      imapPort,
      caldavUrl,
    );

    const credential: StandardsCredential = {
      password: body.password,
      ...(imapHost !== undefined && { imapHost }),
      ...(imapPort !== undefined && { imapPort }),
      ...(caldavUrl !== undefined && { caldavUrl }),
    };
    const sealed = await sealCredential(this.deps.secretBox, credential);

    let accountId: string;
    if (existingRow) {
      const capabilities = Array.from(new Set([...existingRow.capabilities, ...body.capabilities]));
      const [row] = await this.deps.db
        .update(connectedAccounts)
        .set({
          capabilities,
          credentialEnc: sealed,
          status: 'connected',
          lastError: null,
          consecutiveFailures: 0,
          nextRefreshAt: this.now(),
          updatedAt: this.now(),
        })
        .where(eq(connectedAccounts.id, existingRow.id))
        .returning();
      if (!row) throw new Error('createStandards: merge update returned no row');
      accountId = row.id;
      await this.audit(userId, 'reconnect', accountId);
    } else {
      const colour = await this.getNextColour(userId);
      const [row] = await this.deps.db
        .insert(connectedAccounts)
        .values({
          userId,
          provider: 'standards',
          address,
          label: address,
          colour,
          capabilities: body.capabilities,
          grantedScopes: [],
          credentialEnc: sealed,
          status: 'connected',
          nextRefreshAt: this.now(),
        })
        .returning();
      if (!row) throw new Error('createStandards: insert returned no row');
      accountId = row.id;
      await this.audit(userId, 'connect', accountId);
    }

    await this.deps.enqueue('panels.refresh', { accountId }, { userId });

    const [final] = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, accountId));
    if (!final) throw new Error('createStandards: account vanished after save');
    return final;
  }
}
