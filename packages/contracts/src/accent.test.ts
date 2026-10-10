import { describe, expect, it } from 'vitest';
import { ACCENT_IDS } from './accent.js';
import { UserResponse } from './auth.js';
import { PatchMeRequest } from './me.js';

const user = {
  id: 'u',
  email: 'a@b.co',
  defaultCurrency: 'GBP',
  theme: 'system',
  timeZone: 'UTC',
  onboardingCompletedAt: null,
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('accent ids', () => {
  it('defaults to signal-green first', () => {
    expect(ACCENT_IDS[0]).toBe('signal-green');
  });

  it('rejects hex values on the user and the patch', () => {
    expect(() => UserResponse.parse({ ...user, accent: '#fff' })).toThrow();
    expect(() => PatchMeRequest.parse({ accent: '#fff' })).toThrow();
    expect(UserResponse.parse({ ...user, accent: 'slate' }).accent).toBe('slate');
  });
});
