import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFileSync } from 'node:fs';
import { MOTION_PRESET_IDS } from '@desk/contracts';
import { eq } from 'drizzle-orm';
import { runMigrations } from '@desk/db/migrate';
import { createDb, users } from '@desk/db';

describe('users motion columns migration', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    await runMigrations(container.getConnectionUri());
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('defaults new rows and rejects bad preset and colour', async () => {
    const { db, close } = createDb(container.getConnectionUri());
    try {
      const [u] = await db
        .insert(users)
        .values({ email: 'motion@desk.test', defaultCurrency: 'GBP' })
        .returning();
      expect(u!.motionPreset).toBe('particles');
      expect(u!.motionColour).toBe('#7fd1a8');
      expect(u!.panelsTranslucent).toBe(true);
      expect(u!.motionPaused).toBe(false);
      for (const id of MOTION_PRESET_IDS) {
        await db.update(users).set({ motionPreset: id }).where(eq(users.id, u!.id));
      }
      await expect(
        db.update(users).set({ motionPreset: 'sparkle' }).where(eq(users.id, u!.id)),
      ).rejects.toThrow();
      await expect(
        db.update(users).set({ motionColour: '#FFF' }).where(eq(users.id, u!.id)),
      ).rejects.toThrow();
      await expect(
        db.update(users).set({ motionColour: '#7FD1A8' }).where(eq(users.id, u!.id)),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  // Lives here, not in contracts, because contracts has no node types.
  it('CHECK lists every MOTION_PRESET_IDS entry', () => {
    const sql = readFileSync(
      new URL('../../../packages/db/migrations/0012_user_motion.sql', import.meta.url),
      'utf8',
    );
    for (const id of MOTION_PRESET_IDS) expect(sql).toContain(`'${id}'`);
  });
});

describe('users free colours migration (0013)', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    await runMigrations(container.getConnectionUri());
  });

  afterAll(async () => {
    await container?.stop();
  });

  it('defaults to NULL and rejects anything but lowercase #rrggbb', async () => {
    const { db, close } = createDb(container.getConnectionUri());
    try {
      const [u] = await db
        .insert(users)
        .values({ email: 'free@desk.test', defaultCurrency: 'GBP' })
        .returning();
      expect([u!.accentCustom, u!.groundTint, u!.navColour]).toEqual([null, null, null]);
      await db
        .update(users)
        .set({ accentCustom: '#aabbcc', groundTint: '#000000', navColour: '#ffffff' })
        .where(eq(users.id, u!.id));
      await db
        .update(users)
        .set({ accentCustom: null, groundTint: null, navColour: null })
        .where(eq(users.id, u!.id));
      for (const bad of ['#FFF', '#AABBCC', 'red', '']) {
        for (const col of ['accentCustom', 'groundTint', 'navColour'] as const) {
          await expect(
            db
              .update(users)
              .set({ [col]: bad })
              .where(eq(users.id, u!.id)),
          ).rejects.toThrow();
        }
      }
    } finally {
      await close();
    }
  });
});
