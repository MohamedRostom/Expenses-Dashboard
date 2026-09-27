// T074: SC-005 load check. Seeds one user with ten accounts x fifty messages each, plus seven
// days of calendar events, and asserts GET /panels/today stays under 500ms server-side. The
// harness's `app.request` never leaves the process (no real socket), so timing it is timing the
// route handler — no separate "strip network overhead" step is needed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setGlobalFlag } from '@desk/db';
import { accountCalendars, cachedEvents, cachedMessages, connectedAccounts } from '@desk/db';
import { startHarness, TEST_SECRET_BOX_KEY, type Harness } from './harness.js';
import { createSecretBox } from '../src/adapters/secret-box.js';
import { sealCredential } from '../src/lib/credential.js';

const secretBox = createSecretBox(TEST_SECRET_BOX_KEY);

const ACCOUNT_COUNT = 10;
const MESSAGES_PER_ACCOUNT = 50;
const EVENT_DAYS = 7;
const EVENTS_PER_DAY_PER_ACCOUNT = 3;
const SC_005_BUDGET_MS = 500;
const WARMUP_REQUESTS = 1;
const TIMED_REQUESTS = 7;

describe('GET /panels/today — SC-005 load (T074)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    await setGlobalFlag(harness.db, 'panels.today', true);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  it('answers in under 500ms (median of several requests) for 10 accounts x 50 messages + 7 days of events', async () => {
    const user = await harness.asUser('today-load@example.com');
    harness.clock.set(new Date('2026-10-05T12:00:00Z'));

    for (let a = 0; a < ACCOUNT_COUNT; a++) {
      const credentialEnc = await sealCredential(secretBox, { refreshToken: 'rt' });
      const [account] = await harness.db
        .insert(connectedAccounts)
        .values({
          userId: user.userId,
          provider: 'google',
          address: `load-${a}@example.com`,
          label: `Acct ${a}`,
          colour: 'teal',
          capabilities: ['mail', 'calendar'],
          grantedScopes: ['calendar.readonly', 'gmail.readonly'],
          credentialEnc,
          status: 'connected',
          lastRefreshAt: new Date('2026-10-05T11:58:00Z'),
          nextRefreshAt: new Date('2026-10-05T12:00:00Z'),
        })
        .returning();
      if (!account) throw new Error('failed to insert account');

      const [calendar] = await harness.db
        .insert(accountCalendars)
        .values({
          userId: user.userId,
          accountId: account.id,
          providerCalendarId: `cal-${a}`,
          name: 'Calendar',
          isPrimary: true,
          enabled: true,
        })
        .returning();
      if (!calendar) throw new Error('failed to insert calendar');

      const messages = Array.from({ length: MESSAGES_PER_ACCOUNT }, (_, m) => ({
        userId: user.userId,
        accountId: account.id,
        providerMessageId: `msg-${a}-${m}`,
        fromName: `Sender ${m}`,
        fromAddress: `sender-${m}@example.com`,
        subject: `Subject ${m}`,
        preview: 'Preview text for load testing purposes.',
        receivedAt: new Date(Date.parse('2026-10-05T09:00:00Z') - m * 60_000),
        unread: m % 2 === 0,
        seenAt: new Date('2026-10-05T12:00:00Z'),
      }));
      await harness.db.insert(cachedMessages).values(messages);

      const events = [];
      for (let d = 0; d < EVENT_DAYS; d++) {
        for (let e = 0; e < EVENTS_PER_DAY_PER_ACCOUNT; e++) {
          const startsAt = new Date(
            Date.parse('2026-10-05T09:00:00Z') + d * 24 * 60 * 60 * 1000 + e * 3_600_000,
          );
          events.push({
            userId: user.userId,
            accountId: account.id,
            calendarId: calendar.id,
            providerEventId: `ev-${a}-${d}-${e}`,
            title: `Event ${a}-${d}-${e}`,
            startsAt,
            endsAt: new Date(startsAt.getTime() + 30 * 60_000),
            allDay: false,
            tentative: false,
            seenAt: new Date('2026-10-05T12:00:00Z'),
          });
        }
      }
      await harness.db.insert(cachedEvents).values(events);
    }

    // Confirm the seed matches the spec exactly before trusting the timing below.
    const seededMessages = await harness.db.select().from(cachedMessages);
    const seededEvents = await harness.db.select().from(cachedEvents);
    expect(seededMessages.length).toBe(ACCOUNT_COUNT * MESSAGES_PER_ACCOUNT);
    expect(seededEvents.length).toBe(ACCOUNT_COUNT * EVENT_DAYS * EVENTS_PER_DAY_PER_ACCOUNT);

    // One warm-up request (connection pool, query planner, JIT) that isn't timed.
    for (let i = 0; i < WARMUP_REQUESTS; i++) {
      const res = await user.get('/panels/today');
      expect(res.status).toBe(200);
    }

    const durationsMs: number[] = [];
    for (let i = 0; i < TIMED_REQUESTS; i++) {
      const start = performance.now();
      const res = await user.get('/panels/today');
      const durationMs = performance.now() - start;
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        accounts: unknown[];
        messages: unknown[];
        days: Array<{ events: unknown[] }>;
      };
      expect(body.accounts.length).toBe(ACCOUNT_COUNT);
      expect(body.messages.length).toBe(ACCOUNT_COUNT * MESSAGES_PER_ACCOUNT);
      durationsMs.push(durationMs);
    }

    durationsMs.sort((a, b) => a - b);
    const mid = Math.floor(durationsMs.length / 2);
    const medianMs =
      durationsMs.length % 2 === 0
        ? (durationsMs[mid - 1]! + durationsMs[mid]!) / 2
        : durationsMs[mid]!;

    console.log(
      `[T074] GET /panels/today durations (ms): ${durationsMs.map((d) => d.toFixed(1)).join(', ')} — median ${medianMs.toFixed(1)}`,
    );

    expect(medianMs).toBeLessThan(SC_005_BUDGET_MS);
  }, 60_000);
});
