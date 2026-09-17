import { z } from 'zod';

/** Every variable the Node entry point reads. Keep .env.example in sync. */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  GIT_SHA: z
    .string()
    .optional()
    .transform((s) => (s && s.length > 0 ? s : 'unknown')),
});
export type Env = z.infer<typeof envSchema>;

/** The subset of the schema the Workers entry point receives as bindings. */
export const bindingsSchema = envSchema.pick({ GIT_SHA: true });
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
