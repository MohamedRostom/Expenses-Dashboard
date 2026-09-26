import { eq } from 'drizzle-orm';
import type { Db } from '@desk/db';
import { connectedAccounts } from '@desk/db';
import type { SecretBox } from '../adapters/secret-box.js';
import type { Clock } from '../app.js';

const COLOUR_PALETTE = [
  'teal',
  'blue',
  'violet',
  'pink',
  'orange',
  'amber',
  'green',
  'slate',
] as const;

export type ConnectionsServiceDeps = {
  db: Db;
  secretBox: SecretBox;
  clock: Clock;
};

export class ConnectionsService {
  constructor(private deps: ConnectionsServiceDeps) {}

  /** Get the next unused colour from the palette for a user's accounts. */
  async getNextColour(userId: string): Promise<string> {
    const existing = await this.deps.db
      .select({ colour: connectedAccounts.colour })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, userId));

    const usedColours = new Set(existing.map((a) => a.colour).filter(Boolean));
    for (const colour of COLOUR_PALETTE) {
      if (!usedColours.has(colour)) return colour;
    }
    return COLOUR_PALETTE[0];
  }

  /** Check if a user is at the ten-account limit. If accountId is provided,
   * check against existing accounts to allow reconnecting. */
  async checkLimit(userId: string, accountId?: string): Promise<boolean> {
    const count = await this.deps.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, userId));

    if (accountId) {
      // If trying to add capability to an existing account, don't count it as a new one
      return count.length >= 10 && !count.some((a) => a.id === accountId);
    }
    return count.length >= 10;
  }

  /** Seal a credential (refresh token) with SecretBox. */
  async sealCredential(credential: string): Promise<string> {
    return this.deps.secretBox.seal(credential);
  }

  /** Get the current time. */
  now(): Date {
    return this.deps.clock.now();
  }
}
