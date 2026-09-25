import { describe, expect, it } from 'vitest';
import { diff, type InvalidRemoteRow, type LocalRow, type RemoteRow } from './diff.js';

function localRow(overrides: Partial<LocalRow> = {}): LocalRow {
  return {
    id: 'exp-1',
    notionPageId: null,
    updatedAt: '2026-09-10T10:00:00.000Z',
    deletedAt: null,
    description: 'Coffee',
    amountOriginal: 350,
    currencyOriginal: 'GBP',
    expenseDate: '2026-09-10',
    categoryName: 'Eating out',
    paidWith: 'Card',
    kind: 'Variable',
    notes: null,
    addedVia: 'Dashboard',
    ...overrides,
  };
}

function remoteRow(overrides: Partial<RemoteRow> = {}): RemoteRow {
  return {
    pageId: 'page-1',
    lastEditedTime: '2026-09-10T10:00:00.000Z',
    archived: false,
    description: 'Coffee',
    amountOriginal: 350,
    currencyOriginal: 'GBP',
    expenseDate: '2026-09-10',
    categoryName: 'Eating out',
    paidWith: 'Card',
    kind: 'Variable',
    notes: null,
    addedVia: 'Notion',
    expenseId: null,
    ...overrides,
  };
}

describe('diff', () => {
  it('create both sides: unlinked local row -> toNotion create, unlinked remote row -> toLocal create', () => {
    const local = [localRow({ id: 'local-only', notionPageId: null })];
    const remote = [remoteRow({ pageId: 'remote-only' })];
    const cursor = { lastSyncAt: '2026-09-09T00:00:00.000Z' };

    const result = diff(local, remote, cursor, 'both');

    expect(result.toNotion).toEqual([{ row: local[0], op: 'create' }]);
    expect(result.toLocal).toEqual([{ row: remote[0], op: 'create' }]);
    expect(result.conflicts).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('edit both sides since cursor: matched pair, only local changed -> toNotion update only', () => {
    const cursor = { lastSyncAt: '2026-09-10T00:00:00.000Z' };
    const local = [localRow({ notionPageId: 'page-1', updatedAt: '2026-09-11T00:00:00.000Z' })];
    const remote = [remoteRow({ pageId: 'page-1', lastEditedTime: '2026-09-05T00:00:00.000Z' })];

    const result = diff(local, remote, cursor, 'both');

    expect(result.toNotion).toEqual([{ row: local[0], op: 'update' }]);
    expect(result.toLocal).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('edit both sides since cursor: matched pair, both changed -> conflict, later edit wins', () => {
    const cursor = { lastSyncAt: '2026-09-10T00:00:00.000Z' };
    const local = [localRow({ notionPageId: 'page-1', updatedAt: '2026-09-11T00:00:00.000Z' })];
    const remote = [remoteRow({ pageId: 'page-1', lastEditedTime: '2026-09-12T00:00:00.000Z' })];

    const result = diff(local, remote, cursor, 'both');

    expect(result.conflicts).toEqual([{ local: local[0], remote: remote[0], winner: 'remote' }]);
    expect(result.toLocal).toEqual([{ row: remote[0], op: 'update' }]);
    expect(result.toNotion).toEqual([]);
  });

  it('delete one side: local row linked to a page no longer in the (complete) remote list -> toLocal delete', () => {
    const cursor = { lastSyncAt: '2026-09-10T00:00:00.000Z' };
    const local = [localRow({ notionPageId: 'page-gone', updatedAt: '2026-09-11T00:00:00.000Z' })];

    const result = diff(local, [], cursor, 'both');

    expect(result.toLocal).toHaveLength(1);
    expect(result.toLocal[0]?.op).toBe('delete');
    expect(result.toLocal[0]?.row.pageId).toBe('page-gone');
  });

  it('delete one side: to_notion-only direction does not act on a remote-side delete', () => {
    const cursor = { lastSyncAt: '2026-09-10T00:00:00.000Z' };
    const local = [localRow({ notionPageId: 'page-gone', updatedAt: '2026-09-11T00:00:00.000Z' })];

    const result = diff(local, [], cursor, 'to_notion');

    expect(result.toLocal).toEqual([]);
  });

  it('clock skew: remote clock ahead of wall time still compares correctly as ISO strings', () => {
    const cursor = { lastSyncAt: '2026-09-10T00:00:00.000Z' };
    const local = [localRow({ notionPageId: 'page-1', updatedAt: '2026-09-11T00:00:00.000Z' })];
    // Remote's clock is far ahead (a skewed server) but still later in ISO terms -> remote wins.
    const remote = [remoteRow({ pageId: 'page-1', lastEditedTime: '2099-01-01T00:00:00.000Z' })];

    const result = diff(local, remote, cursor, 'both');

    expect(result.conflicts[0]?.winner).toBe('remote');
  });

  it('tie goes to Desk: identical timestamps on both sides resolve to local', () => {
    const cursor = { lastSyncAt: '2026-09-10T00:00:00.000Z' };
    const ts = '2026-09-11T00:00:00.000Z';
    const local = [localRow({ notionPageId: 'page-1', updatedAt: ts })];
    const remote = [remoteRow({ pageId: 'page-1', lastEditedTime: ts })];

    const result = diff(local, remote, cursor, 'both');

    expect(result.conflicts).toEqual([{ local: local[0], remote: remote[0], winner: 'local' }]);
    expect(result.toNotion).toEqual([{ row: local[0], op: 'update' }]);
    expect(result.toLocal).toEqual([]);
  });

  it('invalid remote row is skipped with a reason, never thrown', () => {
    const invalid: InvalidRemoteRow = {
      invalid: true,
      reason: 'missing or invalid Amount',
      raw: { id: 'page-bad' },
    };
    const cursor = { lastSyncAt: '2026-09-10T00:00:00.000Z' };

    const result = diff([], [invalid], cursor, 'both');

    expect(result.skipped).toEqual([
      { remote: { id: 'page-bad' }, reason: 'missing or invalid Amount' },
    ]);
    expect(result.toLocal).toEqual([]);
  });

  it('first sync (cursor null) imports all pre-existing unmatched remote rows, not just recently edited ones', () => {
    const remote = [
      remoteRow({ pageId: 'old-1', lastEditedTime: '2020-01-01T00:00:00.000Z' }),
      remoteRow({ pageId: 'old-2', lastEditedTime: '2021-06-15T00:00:00.000Z' }),
    ];

    const result = diff([], remote, null, 'from_notion');

    expect(result.toLocal).toEqual([
      { row: remote[0], op: 'create' },
      { row: remote[1], op: 'create' },
    ]);
  });

  it('direction change semantics: a prior to_notion-only local row now also considered for from_notion once direction includes it', () => {
    // Simulates: connection was to_notion only (this local row was pushed and linked); user
    // switches to `both`. The very next diff call passes cursor: null to force the reconcile.
    // Content genuinely differs (description) so this exercises conflict *resolution*, not just
    // the "changed since" bookkeeping — a full reconcile with identical content is covered
    // separately below and must NOT report a conflict.
    const local = [
      localRow({
        notionPageId: 'page-1',
        updatedAt: '2026-09-01T00:00:00.000Z',
        description: 'Coffee (local)',
      }),
    ];
    const remote = [
      remoteRow({
        pageId: 'page-1',
        lastEditedTime: '2026-09-05T00:00:00.000Z',
        description: 'Coffee (remote)',
      }),
    ];

    const result = diff(local, remote, null, 'both');

    // Both sides differ (full reconcile treats both as "changed"): conflict, remote is later.
    expect(result.conflicts).toEqual([{ local: local[0], remote: remote[0], winner: 'remote' }]);
    expect(result.toLocal).toEqual([{ row: remote[0], op: 'update' }]);
  });

  it('full reconcile of a matched pair with identical content reports no conflict', () => {
    // C2/Important-list fix: cursor === null used to mean "every matched row is a conflict",
    // regardless of whether the two sides actually agree — writing two sync_conflict versions
    // per expense on every single first sync.
    const local = [localRow({ notionPageId: 'page-1', updatedAt: '2020-01-01T00:00:00.000Z' })];
    const remote = [remoteRow({ pageId: 'page-1', lastEditedTime: '2021-01-01T00:00:00.000Z' })];

    const result = diff(local, remote, null, 'both');

    expect(result.conflicts).toEqual([]);
    expect(result.toLocal).toEqual([]);
    expect(result.toNotion).toEqual([]);
  });

  it('full reconcile on switch to both: pre-existing unlinked remote rows are imported even though direction was from_notion-exclusive before', () => {
    const local = [localRow({ id: 'already-synced', notionPageId: 'page-synced' })];
    const remote = [
      remoteRow({ pageId: 'page-synced' }),
      remoteRow({ pageId: 'page-new', lastEditedTime: '2019-01-01T00:00:00.000Z' }),
    ];

    const result = diff(local, remote, null, 'both');

    expect(result.toLocal.some((e) => e.row.pageId === 'page-new' && e.op === 'create')).toBe(true);
  });
});
