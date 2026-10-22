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
  motionPreset: 'particles',
  motionColour: '#7fd1a8',
  panelsTranslucent: true,
  motionPaused: false,
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

describe('motion appearance fields (spec 006 contracts/me-appearance.md)', () => {
  const full = {
    ...user,
    accent: 'signal-green',
  };

  it('requires the four fields on the user', () => {
    expect(UserResponse.parse(full).motionPreset).toBe('particles');
    for (const k of ['motionPreset', 'motionColour', 'panelsTranslucent', 'motionPaused']) {
      const rest: Record<string, unknown> = { ...full };
      delete rest[k];
      expect(() => UserResponse.parse(rest)).toThrow();
    }
  });

  it('patch accepts any subset and either colour case, rejects bad values', () => {
    expect(PatchMeRequest.parse({})).toEqual({});
    expect(PatchMeRequest.parse({ motionColour: '#7FD1A8' }).motionColour).toBe('#7FD1A8');
    expect(
      PatchMeRequest.parse({
        motionPreset: 'aurora',
        panelsTranslucent: false,
        motionPaused: true,
      }),
    ).toMatchObject({ motionPreset: 'aurora' });
    expect(() => PatchMeRequest.parse({ motionPreset: 'confetti' })).toThrow();
    expect(() => PatchMeRequest.parse({ motionColour: 'red' })).toThrow();
    expect(() => PatchMeRequest.parse({ motionColour: '#fff' })).toThrow();
    expect(() => PatchMeRequest.parse({ panelsTranslucent: 'yes' })).toThrow();
    expect(() => PatchMeRequest.parse({ motionPaused: 1 })).toThrow();
  });
});
