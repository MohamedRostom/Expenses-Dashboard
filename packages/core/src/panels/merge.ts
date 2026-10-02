/**
 * Merges cached mail rows from every connected account into the Today mail panel's single
 * newest-first list (FR-012 / contracts/providers.md MessageHeader). Pure — no I/O; the API
 * service passes in whatever rows it already loaded per account.
 */

export type MessageRow = {
  providerMessageId: string;
  fromName?: string;
  fromAddress: string;
  subject: string;
  preview: string;
  receivedAt: Date;
  unread: boolean;
  link?: string;
};

export type MergedMessageRow<T extends MessageRow = MessageRow> = T & { accountId: string };

/** Newest `capPerAccount` rows per account (default 50, data-model.md cached_messages), merged
 * and sorted newest first across every account. */
export function mergeMessages<T extends MessageRow>(
  byAccount: Record<string, T[]>,
  capPerAccount = 50,
): MergedMessageRow<T>[] {
  const rows: MergedMessageRow<T>[] = [];
  for (const [accountId, messages] of Object.entries(byAccount)) {
    const newest = [...messages]
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, capPerAccount);
    for (const m of newest) rows.push({ ...m, accountId });
  }
  return rows.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
}

/** Per-account unread badge: the cached unread count, replaced by the provider's own total
 * (IMAP SEARCH UNSEEN) when that is larger than what's cached (data-model.md cached_messages). */
export function unreadCountFor(rows: { unread: boolean }[], unreadTotal?: number): number {
  const cached = rows.reduce((n, r) => n + (r.unread ? 1 : 0), 0);
  return unreadTotal !== undefined && unreadTotal > cached ? unreadTotal : cached;
}
