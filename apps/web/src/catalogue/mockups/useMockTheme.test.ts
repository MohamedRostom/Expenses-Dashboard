import { describe, expect, it } from 'vitest';
import { setMockTheme } from './useMockTheme.js';

describe('setMockTheme', () => {
  it('sets data-theme for light and dark, clears it for system', () => {
    const el = document.createElement('div');
    setMockTheme(el, 'dark');
    expect(el.getAttribute('data-theme')).toBe('dark');
    setMockTheme(el, 'light');
    expect(el.getAttribute('data-theme')).toBe('light');
    setMockTheme(el, 'system');
    expect(el.hasAttribute('data-theme')).toBe(false);
  });

  it('writes no storage', () => {
    const el = document.createElement('div');
    setMockTheme(el, 'dark');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});
