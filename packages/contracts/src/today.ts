import { z } from 'zod';

export const TodayEvent = z.object({
  id: z.string(),
  accountId: z.string(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  tentative: z.boolean(),
  link: z.string().url().nullable(),
});
export type TodayEventT = z.infer<typeof TodayEvent>;

export const TodayMessage = z.object({
  id: z.string(),
  accountId: z.string(),
  fromName: z.string(),
  fromAddress: z.string().email(),
  subject: z.string(),
  preview: z.string(),
  receivedAt: z.string(),
  unread: z.boolean(),
  link: z.string().url().nullable(),
});
export type TodayMessageT = z.infer<typeof TodayMessage>;

export const TodayAccount = z.object({
  id: z.string(),
  provider: z.enum(['google', 'microsoft', 'standards']),
  label: z.string(),
  colour: z.string(),
  capabilities: z.array(z.enum(['mail', 'calendar'])),
  status: z.enum(['connected', 'reconnect_needed', 'error', 'paused']),
  lastRefreshAt: z.string().nullable(),
  lastError: z.string().nullable(),
  stale: z.boolean(),
  purged: z.boolean(),
  unreadCount: z.number().int().nonnegative(),
  reconnectUrl: z.string().url().optional(),
});
export type TodayAccountT = z.infer<typeof TodayAccount>;

export const TodayDay = z.object({
  date: z.string(),
  events: z.array(TodayEvent),
});
export type TodayDayT = z.infer<typeof TodayDay>;

export const TodayResponse = z.object({
  days: z.array(TodayDay),
  messages: z.array(TodayMessage),
  accounts: z.array(TodayAccount),
  generatedAt: z.string(),
});
export type TodayResponseT = z.infer<typeof TodayResponse>;

export const RefreshResponse = z.object({
  queued: z.array(z.string()),
});
export type RefreshResponseT = z.infer<typeof RefreshResponse>;
