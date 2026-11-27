import { describe, expect, it } from 'vitest';
import { ErrorCode } from './errors.js';
import { NotionConnectionStatus, NotionConnectOutcome } from './notion.js';

describe('notion connect contracts', () => {
  it('accepts feature_unavailable as an error code', () => {
    expect(ErrorCode.parse('feature_unavailable')).toBe('feature_unavailable');
  });
  it('accepts reconnect_needed as a connection status', () => {
    expect(NotionConnectionStatus.parse('reconnect_needed')).toBe('reconnect_needed');
  });
  it('parses every connect outcome and rejects others', () => {
    for (const o of ['connected', 'no_pages', 'denied', 'expired', 'failed', 'unavailable']) {
      expect(NotionConnectOutcome.parse(o)).toBe(o);
    }
    expect(() => NotionConnectOutcome.parse('bogus')).toThrow();
  });
});
