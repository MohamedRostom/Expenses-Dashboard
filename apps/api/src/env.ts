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

/** Parses the environment and throws a readable error naming each missing or invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Refusing to start, invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}
