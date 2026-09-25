import type { MappedRemote } from './mapping.js';

export interface LocalRow {
  id: string;
  notionPageId: string | null;
  updatedAt: string; // ISO timestamp
  deletedAt: string | null;
  description: string;
  amountOriginal: number;
  currencyOriginal: string;
  expenseDate: string;
  categoryName: string | null;
  paidWith: string;
  kind: string;
  notes: string | null;
  addedVia: string;
}

export type RemoteRow = MappedRemote;

/** A remote row that failed mapping (see mapping.ts `fromNotionProperties`) — the caller
 * passes these through untouched so diff() can report them, never crash on them. */
export interface InvalidRemoteRow {
  invalid: true;
  reason: string;
  raw: unknown;
}

export type Direction = 'to_notion' | 'from_notion' | 'both';

export interface SyncCursor {
  lastSyncAt: string; // ISO timestamp
}

export interface ToNotionEntry {
  row: LocalRow;
  op: 'create' | 'update' | 'archive';
}

export interface ToLocalEntry {
  row: RemoteRow;
  op: 'create' | 'update' | 'delete';
}

export interface Conflict {
  local: LocalRow;
  remote: RemoteRow;
  winner: 'local' | 'remote';
}

export interface Skipped {
  remote: unknown;
  reason: string;
}

export interface DiffResult {
  toNotion: ToNotionEntry[];
  toLocal: ToLocalEntry[];
  conflicts: Conflict[];
  skipped: Skipped[];
}

/** True when a matched local/remote pair have the same expense content — ignores id/pageId/
 * timestamps, which by definition differ (or are irrelevant) between the two sides. */
function contentEqual(l: LocalRow, r: RemoteRow): boolean {
  return (
    l.description === r.description &&
    l.amountOriginal === r.amountOriginal &&
    l.currencyOriginal === r.currencyOriginal &&
    l.expenseDate === r.expenseDate &&
    l.categoryName === r.categoryName &&
    l.paidWith === r.paidWith &&
    l.kind === r.kind &&
    l.notes === r.notes
  );
}

function includes(direction: Direction, side: 'to_notion' | 'from_notion'): boolean {
  return direction === 'both' || direction === side;
}

/**
 * Pure diff between local expense rows and remote Notion pages. No I/O.
 *
 * `cursor`: the connection's last successful sync time, or `null`. Passing `null` forces a
 * FULL RECONCILE pass — incremental "changed since cursor" filtering is bypassed and every
 * matched/unmatched row is considered. The caller passes `null` on: the very first sync for a
 * connection ("first sync imports existing rows"), and the sync immediately after `direction`
 * changes to include a side it didn't before ("full reconcile on switch to both" /
 * "direction change semantics") — both are the same signal to this function.
 *
 * Matching key: `local.notionPageId` <-> `remote.pageId`.
 */
export function diff(
  local: LocalRow[],
  remote: (RemoteRow | InvalidRemoteRow)[],
  cursor: SyncCursor | null,
  direction: Direction,
): DiffResult {
  const toNotion: ToNotionEntry[] = [];
  const toLocal: ToLocalEntry[] = [];
  const conflicts: Conflict[] = [];
  const skipped: Skipped[] = [];

  const validRemote: RemoteRow[] = [];
  for (const r of remote) {
    if ('invalid' in r && r.invalid) {
      skipped.push({ remote: r.raw, reason: r.reason });
    } else if ((r as RemoteRow).archived) {
      // Real Notion's data source query excludes archived pages by default, so a linked local
      // row whose remote page got archived shows up here as simply *absent* — the existing
      // "linked pageId no longer present" branch below already handles that as a delete. A
      // caller (or a fake/mock) that includes archived rows anyway must not have diff() match
      // them as if they still existed.
      continue;
    } else {
      validRemote.push(r as RemoteRow);
    }
  }

  const remoteByPageId = new Map(validRemote.map((r) => [r.pageId, r]));
  const matchedPageIds = new Set<string>();

  const changedSince = (iso: string) => cursor === null || iso > cursor.lastSyncAt;

  for (const l of local) {
    if (!l.notionPageId) {
      // No remote link yet: a create candidate for Notion.
      if (includes(direction, 'to_notion') && !l.deletedAt) {
        toNotion.push({ row: l, op: 'create' });
      }
      continue;
    }

    const r = remoteByPageId.get(l.notionPageId);
    if (!r) {
      // Linked pageId no longer present in the (complete) remote list: deleted on Notion's side.
      if (includes(direction, 'from_notion')) {
        toLocal.push({
          row: {
            pageId: l.notionPageId,
            lastEditedTime: l.updatedAt,
            archived: true,
            description: l.description,
            amountOriginal: l.amountOriginal,
            currencyOriginal: l.currencyOriginal,
            expenseDate: l.expenseDate,
            categoryName: l.categoryName,
            paidWith: l.paidWith,
            kind: l.kind,
            notes: l.notes,
            addedVia: l.addedVia,
            expenseId: l.id,
          },
          op: 'delete',
        });
      }
      continue;
    }

    matchedPageIds.add(r.pageId);

    if (l.deletedAt) {
      if (includes(direction, 'to_notion')) toNotion.push({ row: l, op: 'archive' });
      continue;
    }

    // A full reconcile (cursor === null) has no "since" timestamp, so changedSince() is true
    // for every row by definition — without this check, every matched pair became a conflict
    // on the very first sync, even when Notion and Desk already agree, writing two
    // sync_conflict versions per expense for nothing.
    if (cursor === null && contentEqual(l, r)) continue;

    const localChanged = changedSince(l.updatedAt);
    const remoteChanged = changedSince(r.lastEditedTime);

    if (localChanged && remoteChanged) {
      // Both sides moved since the cursor (or this is a full reconcile pass): compare
      // timestamps directly. Tie goes to Desk (local). Comparison is on ISO strings, which
      // sort lexicographically the same as chronologically — correct regardless of which
      // machine's clock is skewed.
      const winner: 'local' | 'remote' = l.updatedAt >= r.lastEditedTime ? 'local' : 'remote';
      conflicts.push({ local: l, remote: r, winner });
      if (winner === 'local' && includes(direction, 'to_notion')) {
        toNotion.push({ row: l, op: 'update' });
      } else if (winner === 'remote' && includes(direction, 'from_notion')) {
        toLocal.push({ row: r, op: 'update' });
      }
    } else if (localChanged && includes(direction, 'to_notion')) {
      toNotion.push({ row: l, op: 'update' });
    } else if (remoteChanged && includes(direction, 'from_notion')) {
      toLocal.push({ row: r, op: 'update' });
    }
  }

  if (includes(direction, 'from_notion')) {
    for (const r of validRemote) {
      if (matchedPageIds.has(r.pageId)) continue;
      // Unmatched remote row: import candidate. On a full reconcile (cursor === null) every
      // unmatched row is imported, not just ones edited since some cursor — that's what makes
      // first sync (and a direction change onto from_notion) pull in pre-existing rows.
      if (cursor === null || changedSince(r.lastEditedTime)) {
        toLocal.push({ row: r, op: 'create' });
      }
    }
  }

  return { toNotion, toLocal, conflicts, skipped };
}
