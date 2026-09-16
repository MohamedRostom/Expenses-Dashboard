import { parseEnv } from '../src/env.js';

describe('parseEnv', () => {
  it('refuses to start when DATABASE_URL is missing and names the variable', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('applies defaults for optional variables', () => {
    expect(parseEnv({ DATABASE_URL: 'postgres://x' })).toEqual({
      DATABASE_URL: 'postgres://x',
      PORT: 3000,
      GIT_SHA: 'unknown',
    });
  });

  it('treats an empty GIT_SHA as unknown and coerces PORT', () => {
    const env = parseEnv({ DATABASE_URL: 'postgres://x', PORT: '8080', GIT_SHA: '' });
    expect(env.PORT).toBe(8080);
    expect(env.GIT_SHA).toBe('unknown');
  });
});
