import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  captureTokens,
  captureReceipts,
  captureCategoryMap,
  categories as categoriesTable,
  expenses as expensesTable,
  auditLog,
  users as usersTable,
  type Db,
} from '@desk/db';
import { parseMajor } from '@desk/core';
import type { CaptureTokenSummaryT, GenericWebhookBodyT } from '@desk/contracts';
import { ApiError } from '../lib/api-error.js';
import type { createExpensesService } from './expenses.js';
import type { RateLimiter } from '../adapters/rate-limiter.js';

const TOKEN_BYTES = 32;
const OTHER_CATEGORY_NAME = 'Other';
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Uint8Array, not Buffer — this file is shared with worker.ts (Cloudflare Workers), which
// doesn't provide Node's Buffer global. Uint8Array works identically for every caller here
// (toBase64Url already typed its param as Uint8Array; Buffer was always just a subtype of it).
async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(digest);
}

function generateToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

function toSummary(row: typeof captureTokens.$inferSelect): CaptureTokenSummaryT {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

/** "Today" per the *user's* time zone, not the server's (contract: date defaults to today in
 * the user's default time zone; UTC if unset — schema already defaults time_zone to 'UTC'). */
export function todayInTimeZone(timeZone: string, now: Date): string {
  try {
    // en-CA formats as YYYY-MM-DD, exactly the expense_date shape.
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(now);
  }
}

/** Minute-truncated ISO timestamp, for the id-less replay key. */
function currentMinute(now: Date): string {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
}

async function receiptKeyFor(
  body: GenericWebhookBodyT,
  amountStr: string,
  date: string,
  now: Date,
): Promise<string> {
  if (body.id) return body.id;
  const material = `${amountStr}|${body.currency.toUpperCase()}|${body.description}|${date}|${currentMinute(now)}`;
  const digest = await sha256(new TextEncoder().encode(material));
  return toHex(digest);
}

export type CaptureService = ReturnType<typeof createCaptureService>;

export function createCaptureService(
  db: Db,
  expensesService: ReturnType<typeof createExpensesService>,
  limiter: RateLimiter,
  clock: { now(): Date },
) {
  async function findOrCreateOther(userId: string): Promise<string> {
    const [existing] = await db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.userId, userId), eq(categoriesTable.name, OTHER_CATEGORY_NAME)))
      .limit(1);
    if (existing) return existing.id;
    const [created] = await db
      .insert(categoriesTable)
      .values({ userId, name: OTHER_CATEGORY_NAME, colour: '#8a1f5c', sortOrder: 999 })
      .returning();
    if (!created) throw new Error('capture: could not find or create Other category');
    return created.id;
  }

  async function audit(userId: string | null, action: string, details: Record<string, unknown>) {
    await db
      .insert(auditLog)
      .values({ userId, actor: 'system', action, subject: 'capture', details });
  }

  return {
    /** Generates a token, stores its hash, and returns the plaintext ONCE. */
    async issueToken(
      userId: string,
      label = 'generic',
    ): Promise<{ token: CaptureTokenSummaryT; secret: string }> {
      const secret = generateToken();
      const tokenHash = await sha256(new TextEncoder().encode(secret));
      const [row] = await db.insert(captureTokens).values({ userId, label, tokenHash }).returning();
      if (!row) throw new Error('issueToken: insert returned no row');
      return { token: toSummary(row), secret };
    },

    /** Revokes the current active token for `label` (if any) and issues a new one. */
    async rotateToken(
      userId: string,
      label = 'generic',
    ): Promise<{ token: CaptureTokenSummaryT; secret: string }> {
      await db
        .update(captureTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(captureTokens.userId, userId),
            eq(captureTokens.label, label),
            isNull(captureTokens.revokedAt),
          ),
        );
      return this.issueToken(userId, label);
    },

    async listTokens(userId: string): Promise<CaptureTokenSummaryT[]> {
      const rows = await db
        .select()
        .from(captureTokens)
        .where(eq(captureTokens.userId, userId))
        .orderBy(desc(captureTokens.createdAt));
      return rows.map(toSummary);
    },

    async getMapping(
      userId: string,
    ): Promise<{ mappings: { label: string; categoryId: string }[]; unmappedLabels: string[] }> {
      const mapped = await db
        .select()
        .from(captureCategoryMap)
        .where(eq(captureCategoryMap.userId, userId));

      // Design choice (T088): the schema has no "labels seen" table. Unmapped labels seen on
      // phone captures are stored verbatim in the created expense's `notes` field (the webhook
      // contract has no notes field of its own); scan phone-added expenses for such labels here.
      const phoneRows = await db
        .select({ notes: expensesTable.notes })
        .from(expensesTable)
        .where(and(eq(expensesTable.userId, userId), eq(expensesTable.addedVia, 'phone')));
      const mappedLabels = new Set(mapped.map((m) => m.label));
      const unmappedLabels = [
        ...new Set(
          phoneRows.map((r) => r.notes).filter((n): n is string => !!n && !mappedLabels.has(n)),
        ),
      ];

      return {
        mappings: mapped.map((m) => ({ label: m.label, categoryId: m.categoryId })),
        unmappedLabels,
      };
    },

    async setMapping(
      userId: string,
      mappings: { label: string; categoryId: string }[],
    ): Promise<void> {
      if (mappings.length > 0) {
        const owned = await db
          .select({ id: categoriesTable.id })
          .from(categoriesTable)
          .where(eq(categoriesTable.userId, userId));
        const ownedIds = new Set(owned.map((c) => c.id));
        // Only-uuid-validated categoryId would let user A map a label to user B's category.
        for (const m of mappings) {
          if (!ownedIds.has(m.categoryId))
            throw new ApiError('not_found', 'Category not found', 404);
        }
      }
      await db.delete(captureCategoryMap).where(eq(captureCategoryMap.userId, userId));
      if (mappings.length === 0) return;
      await db
        .insert(captureCategoryMap)
        .values(mappings.map((m) => ({ userId, label: m.label, categoryId: m.categoryId })));
    },

    /** POST /hooks/generic/:token handler logic. Unauthenticated: the token IS the auth. */
    async handleWebhook(
      tokenPlain: string,
      body: GenericWebhookBodyT,
    ): Promise<{ status: 200 | 201; expenseId: string; duplicate: boolean }> {
      const tokenHash = await sha256(new TextEncoder().encode(tokenPlain));

      const [tokenRow] = await db
        .select()
        .from(captureTokens)
        .where(eq(captureTokens.tokenHash, tokenHash))
        .limit(1);

      if (!tokenRow) {
        // No audit row: this is a public, unauthenticated path — anyone can hammer it with
        // garbage tokens, and a DB row per attempt is unbounded storage growth with no user to
        // attribute it to anyway. A revoked (but real, known) token still gets one below.
        throw new ApiError('not_found', 'Not found', 404);
      }
      if (tokenRow.revokedAt) {
        await audit(tokenRow.userId, 'capture.refused', { reason: 'revoked' });
        throw new ApiError('not_found', 'Not found', 404);
      }

      const underLimit = await limiter.hit(
        `capture:${tokenRow.id}`,
        RATE_LIMIT_PER_MINUTE,
        RATE_LIMIT_WINDOW_MS,
      );
      if (!underLimit) {
        await audit(tokenRow.userId, 'capture.refused', {
          reason: 'rate_limited',
          tokenId: tokenRow.id,
        });
        throw new ApiError('rate_limited', 'Too many requests', 429);
      }

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, tokenRow.userId))
        .limit(1);
      if (!user) throw new ApiError('not_found', 'Not found', 404);

      const currency = body.currency.toUpperCase();
      const amountStr = typeof body.amount === 'number' ? String(body.amount) : body.amount;
      let money;
      try {
        money = parseMajor(amountStr, currency);
      } catch {
        throw new ApiError('validation_failed', 'Invalid amount for currency', 400);
      }

      const date = body.date ?? todayInTimeZone(user.timeZone, clock.now());
      const now = clock.now();
      const receiptKey = await receiptKeyFor(body, amountStr, date, now);

      const [existingReceipt] = await db
        .select()
        .from(captureReceipts)
        .where(
          and(eq(captureReceipts.tokenId, tokenRow.id), eq(captureReceipts.receiptKey, receiptKey)),
        )
        .limit(1);
      if (existingReceipt) {
        return { status: 200, expenseId: existingReceipt.expenseId, duplicate: true };
      }

      let categoryId: string;
      let notes: string | null = null;
      if (body.category) {
        const [mapping] = await db
          .select()
          .from(captureCategoryMap)
          .where(
            and(
              eq(captureCategoryMap.userId, user.id),
              eq(captureCategoryMap.label, body.category),
            ),
          )
          .limit(1);
        if (mapping) {
          categoryId = mapping.categoryId;
        } else {
          categoryId = await findOrCreateOther(user.id);
          notes = body.category; // unmapped: keep the raw label so Settings can show it
        }
      } else {
        categoryId = await findOrCreateOther(user.id);
      }

      // Receipt inserted BEFORE the expense, with a pre-generated id: two concurrent identical
      // deliveries both pass the existingReceipt SELECT above (that's the race), but only one of
      // their INSERTs into (token_id, receipt_key) — the primary key — can win. The loser's
      // insert throws, so it never creates a second, orphaned expense.
      const expenseId = crypto.randomUUID();
      const inserted = await db.execute<{ token_id: string }>(sql`
        INSERT INTO capture_receipts (token_id, receipt_key, expense_id)
        VALUES (${tokenRow.id}, ${receiptKey}, ${expenseId})
        ON CONFLICT (token_id, receipt_key) DO NOTHING
        RETURNING token_id
      `);
      if (inserted.length === 0) {
        // Lost the race: the winner's receipt is now visible — return its expense id.
        const [winner] = await db
          .select()
          .from(captureReceipts)
          .where(
            and(
              eq(captureReceipts.tokenId, tokenRow.id),
              eq(captureReceipts.receiptKey, receiptKey),
            ),
          )
          .limit(1);
        if (!winner) throw new Error('capture: receipt insert conflicted but no row found');
        return { status: 200, expenseId: winner.expenseId, duplicate: true };
      }

      const { expense } = await expensesService.create(
        user.id,
        user.defaultCurrency,
        {
          id: expenseId,
          description: body.description,
          amount: { minor: money.minor, currency },
          date,
          categoryId,
          paidWith: body.paidWith ?? 'other',
          kind: 'variable',
          notes: notes ?? undefined,
        },
        'phone',
      );

      await db
        .update(captureTokens)
        .set({ lastUsedAt: now })
        .where(eq(captureTokens.id, tokenRow.id));

      return { status: 201, expenseId: expense.id, duplicate: false };
    },
  };
}
