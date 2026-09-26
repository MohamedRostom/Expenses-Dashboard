import { parseEnv } from '../src/env.js';

const required = {
  DATABASE_URL: 'postgres://x',
  SESSION_SECRET: 'session-secret',
  SECRET_BOX_KEY: 'secret-box-key',
  APP_ORIGIN: 'http://localhost:5173',
};

describe('parseEnv', () => {
  it('refuses to start when DATABASE_URL is missing and names the variable', () => {
    expect(() => parseEnv({ ...required, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('refuses to start when SESSION_SECRET, SECRET_BOX_KEY or APP_ORIGIN is missing', () => {
    expect(() => parseEnv({ ...required, SESSION_SECRET: undefined })).toThrow(/SESSION_SECRET/);
    expect(() => parseEnv({ ...required, SECRET_BOX_KEY: undefined })).toThrow(/SECRET_BOX_KEY/);
    expect(() => parseEnv({ ...required, APP_ORIGIN: undefined })).toThrow(/APP_ORIGIN/);
  });

  it('applies defaults for optional variables', () => {
    expect(parseEnv(required)).toEqual({
      ...required,
      PORT: 3000,
      GIT_SHA: 'unknown',
      GOOGLE_API_BASE: 'https://www.googleapis.com',
      GRAPH_API_BASE: 'https://graph.microsoft.com',
    });
  });

  it('refuses an empty DATABASE_URL and a non-numeric PORT, naming each', () => {
    expect(() => parseEnv({ ...required, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...required, PORT: 'eighty' })).toThrow(/PORT/);
  });

  it('treats an empty GIT_SHA as unknown and coerces PORT', () => {
    const env = parseEnv({ ...required, PORT: '8080', GIT_SHA: '' });
    expect(env.PORT).toBe(8080);
    expect(env.GIT_SHA).toBe('unknown');
  });

  it('accepts provider keys omitted entirely', () => {
    expect(() => parseEnv(required)).not.toThrow();
  });

  it('accepts a provider pair given together', () => {
    const env = parseEnv({
      ...required,
      GOOGLE_CLIENT_ID: 'g-id',
      GOOGLE_CLIENT_SECRET: 'g-secret',
      NOTION_CLIENT_ID: 'n-id',
      NOTION_CLIENT_SECRET: 'n-secret',
    });
    expect(env.GOOGLE_CLIENT_ID).toBe('g-id');
    expect(env.NOTION_CLIENT_ID).toBe('n-id');
  });

  it('refuses a provider key given without its pair', () => {
    expect(() => parseEnv({ ...required, GOOGLE_CLIENT_ID: 'g-id' })).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() => parseEnv({ ...required, GOOGLE_CLIENT_SECRET: 'g-secret' })).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
    expect(() => parseEnv({ ...required, NOTION_CLIENT_ID: 'n-id' })).toThrow(/NOTION_CLIENT_ID/);
    expect(() => parseEnv({ ...required, NOTION_CLIENT_SECRET: 'n-secret' })).toThrow(
      /NOTION_CLIENT_ID/,
    );
  });

  it('refuses GOOGLE_PANELS keys given without its pair', () => {
    expect(() => parseEnv({ ...required, GOOGLE_PANELS_CLIENT_ID: 'gp-id' })).toThrow(
      /GOOGLE_PANELS_CLIENT_ID/,
    );
    expect(() => parseEnv({ ...required, GOOGLE_PANELS_CLIENT_SECRET: 'gp-secret' })).toThrow(
      /GOOGLE_PANELS_CLIENT_ID/,
    );
  });

  it('accepts GOOGLE_PANELS pair given together', () => {
    const env = parseEnv({
      ...required,
      GOOGLE_PANELS_CLIENT_ID: 'gp-id',
      GOOGLE_PANELS_CLIENT_SECRET: 'gp-secret',
    });
    expect(env.GOOGLE_PANELS_CLIENT_ID).toBe('gp-id');
    expect(env.GOOGLE_PANELS_CLIENT_SECRET).toBe('gp-secret');
  });

  it('refuses MICROSOFT keys given without its pair', () => {
    expect(() => parseEnv({ ...required, MICROSOFT_CLIENT_ID: 'm-id' })).toThrow(
      /MICROSOFT_CLIENT_ID/,
    );
    expect(() => parseEnv({ ...required, MICROSOFT_CLIENT_SECRET: 'm-secret' })).toThrow(
      /MICROSOFT_CLIENT_ID/,
    );
  });

  it('accepts MICROSOFT pair given together', () => {
    const env = parseEnv({
      ...required,
      MICROSOFT_CLIENT_ID: 'm-id',
      MICROSOFT_CLIENT_SECRET: 'm-secret',
    });
    expect(env.MICROSOFT_CLIENT_ID).toBe('m-id');
    expect(env.MICROSOFT_CLIENT_SECRET).toBe('m-secret');
  });

  it('defaults GOOGLE_API_BASE and GRAPH_API_BASE when unset', () => {
    const env = parseEnv(required);
    expect(env.GOOGLE_API_BASE).toBe('https://www.googleapis.com');
    expect(env.GRAPH_API_BASE).toBe('https://graph.microsoft.com');
  });

  it('allows GOOGLE_API_BASE and GRAPH_API_BASE to be overridden', () => {
    const env = parseEnv({
      ...required,
      GOOGLE_API_BASE: 'https://custom.google.com',
      GRAPH_API_BASE: 'https://custom.graph.com',
    });
    expect(env.GOOGLE_API_BASE).toBe('https://custom.google.com');
    expect(env.GRAPH_API_BASE).toBe('https://custom.graph.com');
  });
});
