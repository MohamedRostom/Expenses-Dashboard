import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeMessages, unreadCountFor, type MessageRow } from './merge.js';

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    providerMessageId: 'm1',
    fromAddress: 'a@b.com',
    subject: 'hi',
    preview: 'preview',
    receivedAt: new Date('2026-01-01T00:00:00Z'),
    unread: false,
    ...overrides,
  };
}

const messageArb = fc
  .record({
    providerMessageId: fc.uuid(),
    fromAddress: fc.constant('a@b.com'),
    subject: fc.string(),
    preview: fc.string({ maxLength: 200 }),
    receivedAt: fc.date({
      min: new Date('2020-01-01'),
      max: new Date('2030-01-01'),
      noInvalidDate: true,
    }),
    unread: fc.boolean(),
  })
  .map((r) => r as MessageRow);

/** fast-check v4 dropped dictionaryOf; build a { accountId: messages[] } record from a small
 * array of unique-keyed tuples instead. */
const byAccountArb = (opts: { minKeys?: number; maxKeys?: number } = {}) =>
  fc
    .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), {
      minLength: opts.minKeys ?? 0,
      maxLength: opts.maxKeys ?? 5,
    })
    .chain((keys) =>
      fc
        .tuple(...keys.map(() => fc.array(messageArb, { maxLength: 20 })))
        .map((lists) => Object.fromEntries(keys.map((k, i) => [k, lists[i]!]))),
    );

describe('mergeMessages', () => {
  it('interleaves messages from N accounts strictly newest first', () => {
    fc.assert(
      fc.property(byAccountArb(), (byAccount) => {
        const merged = mergeMessages(byAccount);
        for (let i = 1; i < merged.length; i++) {
          expect(merged[i - 1]!.receivedAt.getTime()).toBeGreaterThanOrEqual(
            merged[i]!.receivedAt.getTime(),
          );
        }
      }),
    );
  });

  it('caps at fifty rows per account', () => {
    fc.assert(
      fc.property(fc.array(messageArb, { minLength: 60, maxLength: 120 }), (messages) => {
        const merged = mergeMessages({ acc1: messages });
        expect(merged.length).toBe(50);
      }),
    );
  });

  it('caps at a custom capPerAccount', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      row({ providerMessageId: `m${i}`, receivedAt: new Date(2026, 0, i + 1) }),
    );
    const merged = mergeMessages({ acc1: messages }, 3);
    expect(merged.length).toBe(3);
    // newest three: Jan 10, 9, 8
    expect(merged.map((m) => m.providerMessageId)).toEqual(['m9', 'm8', 'm7']);
  });

  it('tags every row with its accountId', () => {
    const merged = mergeMessages({
      acc1: [row({ providerMessageId: 'a' })],
      acc2: [row({ providerMessageId: 'b' })],
    });
    expect(merged.find((m) => m.providerMessageId === 'a')!.accountId).toBe('acc1');
    expect(merged.find((m) => m.providerMessageId === 'b')!.accountId).toBe('acc2');
  });

  it('filtering the merged rows by account keeps only that account rows and count', () => {
    fc.assert(
      fc.property(byAccountArb({ minKeys: 1 }), (byAccount) => {
        const merged = mergeMessages(byAccount);
        for (const accountId of Object.keys(byAccount)) {
          const expectedCount = Math.min(byAccount[accountId]!.length, 50);
          const filtered = merged.filter((m) => m.accountId === accountId);
          expect(filtered.length).toBe(expectedCount);
          expect(filtered.every((m) => m.accountId === accountId)).toBe(true);
        }
      }),
    );
  });
});

describe('unreadCountFor', () => {
  it('equals the count of unread cached rows when no unreadTotal is given', () => {
    const rows = [row({ unread: true }), row({ unread: false }), row({ unread: true })];
    expect(unreadCountFor(rows)).toBe(2);
  });

  it('equals the count of unread cached rows when unreadTotal is not larger', () => {
    const rows = [row({ unread: true }), row({ unread: true })];
    expect(unreadCountFor(rows, 2)).toBe(2);
    expect(unreadCountFor(rows, 1)).toBe(2);
  });

  it('uses unreadTotal when it is larger than the cached count (IMAP SEARCH UNSEEN case)', () => {
    const rows = [row({ unread: true })];
    expect(unreadCountFor(rows, 5)).toBe(5);
  });

  it('property: result is always >= the cached unread count and >= unreadTotal when given', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { maxLength: 60 }),
        fc.option(fc.nat(200)),
        (flags, total) => {
          const rows = flags.map((unread) => row({ unread }));
          const cached = flags.filter(Boolean).length;
          const result = unreadCountFor(rows, total ?? undefined);
          expect(result).toBeGreaterThanOrEqual(cached);
          if (total !== null) expect(result).toBeGreaterThanOrEqual(total);
        },
      ),
    );
  });
});
