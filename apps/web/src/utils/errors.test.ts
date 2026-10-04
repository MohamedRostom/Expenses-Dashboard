import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client.js';
import { toPanelErrorKind } from './errors.js';

afterEach(() => vi.restoreAllMocks());

describe('toPanelErrorKind', () => {
  it.each([
    ['source_unreachable', 502],
    ['source_limit_reached', 503],
    ['place_not_found', 404],
    ['source_paused', 503],
    ['rate_limited', 429],
  ] as const)('maps ApiError code %s to its own kind regardless of status', (code, status) => {
    expect(toPanelErrorKind(new ApiError(code, 'x', status))).toBe(code);
  });

  it('keeps 401 as session_expired', () => {
    expect(toPanelErrorKind(new ApiError('unauthenticated', 'x', 401))).toBe('session_expired');
  });

  it('maps rate_unavailable and unknown 5xx as before', () => {
    expect(toPanelErrorKind(new ApiError('rate_unavailable', 'x', 503))).toBe('rate_unavailable');
    expect(toPanelErrorKind(new ApiError('internal', 'x', 500))).toBe('server_error');
  });

  it('reports offline when the device is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(toPanelErrorKind(new ApiError('internal', 'x', 500))).toBe('offline');
  });
});
