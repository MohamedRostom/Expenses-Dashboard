import { describe, expect, it } from 'vitest';
import { googleOAuthEndpoints, microsoftOAuthEndpoints } from '../src/lib/credential.js';

// T029 fix: GOOGLE_OAUTH_BASE/MICROSOFT_LOGIN_BASE point at a docker-network name (`mocks`) in
// compose, reachable from the api container but not from a browser on the host. The authorize
// URL is sent to the browser as a redirect, so it needs its own, host-reachable base.
describe('googleOAuthEndpoints', () => {
  it('returns nothing when no base is given', () => {
    expect(googleOAuthEndpoints()).toEqual({});
  });

  it('derives authorize/token/revoke from one base when no browser base is given', () => {
    expect(googleOAuthEndpoints('http://mocks:4000/google')).toEqual({
      authorize: 'http://mocks:4000/google/o/oauth2/v2/auth',
      token: 'http://mocks:4000/google/token',
      revoke: 'http://mocks:4000/google/revoke',
    });
  });

  it('uses the browser base only for authorize, keeping token/revoke on the server base', () => {
    expect(
      googleOAuthEndpoints('http://mocks:4000/google', 'http://localhost:4000/google'),
    ).toEqual({
      authorize: 'http://localhost:4000/google/o/oauth2/v2/auth',
      token: 'http://mocks:4000/google/token',
      revoke: 'http://mocks:4000/google/revoke',
    });
  });
});

describe('microsoftOAuthEndpoints', () => {
  it('returns nothing when no base is given', () => {
    expect(microsoftOAuthEndpoints()).toEqual({});
  });

  it('derives authorize/token from one base when no browser base is given', () => {
    expect(microsoftOAuthEndpoints('http://mocks:4000/graph')).toEqual({
      authorize: 'http://mocks:4000/graph/common/oauth2/v2.0/authorize',
      token: 'http://mocks:4000/graph/common/oauth2/v2.0/token',
    });
  });

  it('uses the browser base only for authorize, keeping token on the server base', () => {
    expect(
      microsoftOAuthEndpoints('http://mocks:4000/graph', 'http://localhost:4000/graph'),
    ).toEqual({
      authorize: 'http://localhost:4000/graph/common/oauth2/v2.0/authorize',
      token: 'http://mocks:4000/graph/common/oauth2/v2.0/token',
    });
  });
});
