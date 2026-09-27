import { z } from 'zod';

export const Capability = z.enum(['mail', 'calendar']);
export type CapabilityT = z.infer<typeof Capability>;

export const ProviderId = z.enum(['google', 'microsoft', 'standards']);
export type ProviderIdT = z.infer<typeof ProviderId>;

export const ProviderPreset = z.object({
  name: z.string(),
  imapHost: z.string(),
  imapPort: z.number().int(),
  caldavUrl: z.string(),
});
export type ProviderPresetT = z.infer<typeof ProviderPreset>;

export const Provider = z.object({
  id: ProviderId,
  capabilities: z.array(Capability),
  presets: z.array(ProviderPreset).optional(),
});
export type ProviderT = z.infer<typeof Provider>;

export const Calendar = z.object({
  id: z.string(),
  name: z.string(),
  isPrimary: z.boolean(),
  enabled: z.boolean(),
});
export type CalendarT = z.infer<typeof Calendar>;

export const Account = z.object({
  id: z.string(),
  provider: ProviderId,
  address: z.string().email(),
  label: z.string(),
  colour: z.string(),
  capabilities: z.array(Capability),
  grantedScopes: z.array(z.string()),
  status: z.enum(['connected', 'reconnect_needed', 'error', 'paused']),
  pausedAt: z.string().nullable(),
  lastRefreshAt: z.string().nullable(),
  lastError: z.string().nullable(),
  calendars: z.array(Calendar),
});
export type AccountT = z.infer<typeof Account>;

export const ConnectionsResponse = z.object({
  accounts: z.array(Account),
  limit: z.number().int(),
});
export type ConnectionsResponseT = z.infer<typeof ConnectionsResponse>;

export const ProvidersResponse = z.object({
  providers: z.array(Provider),
});
export type ProvidersResponseT = z.infer<typeof ProvidersResponse>;

export const StandardsCreate = z.object({
  address: z.string().email(),
  password: z.string(),
  imapHost: z.string().optional(),
  imapPort: z.number().int().optional(),
  caldavUrl: z.string().optional(),
  capabilities: z.array(Capability),
});
export type StandardsCreateT = z.infer<typeof StandardsCreate>;

export const StandardsCreateResponse = z.object({
  account: Account,
});
export type StandardsCreateResponseT = z.infer<typeof StandardsCreateResponse>;

export const AccountPatch = z.object({
  label: z.string().optional(),
  colour: z.string().optional(),
  paused: z.boolean().optional(),
  calendars: z.array(z.object({ id: z.string(), enabled: z.boolean() })).optional(),
});
export type AccountPatchT = z.infer<typeof AccountPatch>;

export const CalendarsResponse = z.object({
  calendars: z.array(Calendar),
});
export type CalendarsResponseT = z.infer<typeof CalendarsResponse>;

export const ReconnectResponse = z.union([
  z.object({ url: z.string().url() }),
  z.object({ needsPassword: z.literal(true) }),
]);
export type ReconnectResponseT = z.infer<typeof ReconnectResponse>;
