import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFlagsStore } from './flags';
import * as client from '../api/client';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}));

describe('FlagsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('loads flags once', async () => {
    const mockFetch = vi.spyOn(client, 'apiFetch').mockResolvedValue({
      flags: { 'panels.today': true, 'panels.google_calendar': false },
    });

    const store = useFlagsStore();
    await store.load();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith('/flags');
    expect(store.flags).toEqual({
      'panels.today': true,
      'panels.google_calendar': false,
    });
  });

  it('isOn returns true for on flags', async () => {
    vi.spyOn(client, 'apiFetch').mockResolvedValue({
      flags: { 'panels.today': true },
    });

    const store = useFlagsStore();
    await store.load();

    expect(store.isOn('panels.today')).toBe(true);
  });

  it('isOn returns false for off flags', async () => {
    vi.spyOn(client, 'apiFetch').mockResolvedValue({
      flags: { 'panels.today': false },
    });

    const store = useFlagsStore();
    await store.load();

    expect(store.isOn('panels.today')).toBe(false);
  });

  it('isOn returns false for unknown keys', async () => {
    vi.spyOn(client, 'apiFetch').mockResolvedValue({
      flags: {},
    });

    const store = useFlagsStore();
    await store.load();

    expect(store.isOn('unknown.flag')).toBe(false);
  });

  it('handles load errors gracefully', async () => {
    vi.spyOn(client, 'apiFetch').mockRejectedValue(new Error('Network error'));

    const store = useFlagsStore();
    await store.load();

    expect(store.flags).toEqual({});
    expect(store.isOn('any.flag')).toBe(false);
  });
});
