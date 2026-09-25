import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme } from './theme.js';

describe('applyTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('removes data-theme for system', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('sets data-theme="light" for light', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme="dark" for dark', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
