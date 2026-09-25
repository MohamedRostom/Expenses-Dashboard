import { Hono } from 'hono';
import {
  sessionMiddleware,
  type SessionVariables,
  SESSION_COOKIE,
} from '../../src/middleware/session.js';
import { FakeDb, FakeSessionStore } from '../support/test-deps.js';
import type { Session } from '../../src/adapters/session-store.js';

const fakeUser = {
  id: 'user-1',
  email: 'a@example.com',
  emailVerifiedAt: null,
  passwordHash: null,
  defaultCurrency: 'GBP',
  theme: 'system',
  timeZone: 'UTC',
  onboardingCompletedAt: null,
  createdAt: new Date(),
};

const fakeSession: Session = {
  id: 'sess-1',
  userId: 'user-1',
  tokenHash: 'irrelevant-in-fake',
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(Date.now() + 1000 * 60),
  userAgent: null,
  ip: null,
  revokedAt: null,
};

function buildApp(db: FakeDb, sessions: FakeSessionStore) {
  const app = new Hono<{ Variables: SessionVariables }>();
  app.use('*', sessionMiddleware(db as never, sessions));
  app.get('/x', (c) => c.json({ user: c.get('user'), session: c.get('session') }));
  return app;
}

describe('sessionMiddleware', () => {
  it('leaves user/session null when no cookie is present', async () => {
    const app = buildApp(new FakeDb([fakeUser]), new FakeSessionStore(fakeSession));
    const res = await app.request('/x');
    const body = (await res.json()) as {
      user: { id: string } | null;
      session: { id: string } | null;
    };
    expect(body.user).toBeNull();
    expect(body.session).toBeNull();
  });

  it('leaves user/session null when the session store finds no session for the cookie', async () => {
    const app = buildApp(new FakeDb([fakeUser]), new FakeSessionStore(null));
    const res = await app.request('/x', { headers: { cookie: `${SESSION_COOKIE}=sometoken` } });
    const body = (await res.json()) as {
      user: { id: string } | null;
      session: { id: string } | null;
    };
    expect(body.user).toBeNull();
    expect(body.session).toBeNull();
  });

  it('loads user and session when the cookie maps to a valid session', async () => {
    const app = buildApp(new FakeDb([fakeUser]), new FakeSessionStore(fakeSession));
    const res = await app.request('/x', { headers: { cookie: `${SESSION_COOKIE}=sometoken` } });
    const body = (await res.json()) as {
      user: { id: string } | null;
      session: { id: string } | null;
    };
    expect(body.user!.id).toBe('user-1');
    expect(body.session!.id).toBe('sess-1');
  });

  it('does not reject an unauthenticated request itself', async () => {
    const app = buildApp(new FakeDb([]), new FakeSessionStore(null));
    const res = await app.request('/x');
    expect(res.status).toBe(200);
  });
});
