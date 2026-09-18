import { z } from 'zod';

/** Every variable the Node entry point reads. Keep .env.example in sync. */
const envObjectSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  GIT_SHA: z
    .string()
    .optional()
    .transform((s) => (s && s.length > 0 ? s : 'unknown')),
  SESSION_SECRET: z.string().min(1),
  SECRET_BOX_KEY: z.string().min(1),
  APP_ORIGIN: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NOTION_CLIENT_ID: z.string().optional(),
  NOTION_CLIENT_SECRET: z.string().optional(),
  NOTION_API_BASE: z.string().optional(),
});

export const envSchema = envObjectSchema
  .refine((env) => Boolean(env.GOOGLE_CLIENT_ID) === Boolean(env.GOOGLE_CLIENT_SECRET), {
    message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together or not at all',
    path: ['GOOGLE_CLIENT_ID'],
  })
  .refine((env) => Boolean(env.NOTION_CLIENT_ID) === Boolean(env.NOTION_CLIENT_SECRET), {
    message: 'NOTION_CLIENT_ID and NOTION_CLIENT_SECRET must be set together or not at all',
    path: ['NOTION_CLIENT_ID'],
  });
export type Env = z.infer<typeof envSchema>;

/** The subset of the schema the Workers entry point receives as bindings. */
export const bindingsSchema = envObjectSchema.pick({ GIT_SHA: true });
export type Bindings = z.infer<typeof bindingsSchema>;

function fail(issues: z.core.$ZodIssue[]): never {
  const lines = issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Refusing to start, invalid environment:\n${lines.join('\n')}`);
}

/** Parses the environment and throws a readable error naming each missing or invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  return result.success ? result.data : fail(result.error.issues);
}

/** Same contract for Cloudflare bindings, so both entry points refuse the same bad input. */
export function parseBindings(source: unknown): Bindings {
  const result = bindingsSchema.safeParse(source);
  return result.success ? result.data : fail(result.error.issues);
}
