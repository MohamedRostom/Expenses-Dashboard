import { z } from 'zod';

export const NotionDirection = z.enum(['to_notion', 'from_notion', 'both']);
export type NotionDirectionT = z.infer<typeof NotionDirection>;

export const NotionConnectionStatus = z.enum(['connected', 'error', 'disconnected']);
export type NotionConnectionStatusT = z.infer<typeof NotionConnectionStatus>;

export const NotionConnectionResponse = z.object({
  workspaceName: z.string(),
  databaseId: z.string().nullable(),
  dataSourceId: z.string().nullable(),
  direction: NotionDirection,
  status: NotionConnectionStatus,
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type NotionConnectionResponseT = z.infer<typeof NotionConnectionResponse>;

export const SetNotionConnectionRequest = z.object({
  databaseId: z.string(),
  dataSourceId: z.string(),
  direction: NotionDirection,
});
export type SetNotionConnectionRequestT = z.infer<typeof SetNotionConnectionRequest>;

export const NotionDatabaseOption = z.object({
  id: z.string(),
  title: z.string(),
  compatible: z.boolean(),
});
export type NotionDatabaseOptionT = z.infer<typeof NotionDatabaseOption>;

export const ListNotionDatabasesResponse = z.object({ databases: z.array(NotionDatabaseOption) });
export type ListNotionDatabasesResponseT = z.infer<typeof ListNotionDatabasesResponse>;

export const CreateNotionDatabaseRequest = z.object({
  parentPageId: z.string(),
  title: z.string().min(1),
});
export type CreateNotionDatabaseRequestT = z.infer<typeof CreateNotionDatabaseRequest>;

export const SyncNotionResponse = z.object({
  status: NotionConnectionStatus,
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
  applied: z.number().int(),
  skipped: z.number().int(),
  conflicts: z.number().int(),
});
export type SyncNotionResponseT = z.infer<typeof SyncNotionResponse>;

export const ExpenseVersion = z.object({
  id: z.string(),
  source: z.enum(['app', 'notion', 'sync_conflict']),
  snapshot: z.record(z.string(), z.unknown()),
  editedAt: z.string(),
  createdAt: z.string(),
});
export type ExpenseVersionT = z.infer<typeof ExpenseVersion>;

export const ListExpenseVersionsResponse = z.object({ versions: z.array(ExpenseVersion) });
export type ListExpenseVersionsResponseT = z.infer<typeof ListExpenseVersionsResponse>;
