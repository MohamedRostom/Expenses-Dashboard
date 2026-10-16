import { afterEach, describe, expect, it } from 'vitest';
import { applyAccent, applyTheme } from './theme.js';

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

describe('applyAccent', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-accent');
  });

  it('sets data-accent for a preset', () => {
    applyAccent('violet', true);
    expect(document.documentElement.getAttribute('data-accent')).toBe('violet');
  });

  it('removes data-accent for signal-green, an unknown value or undefined', () => {
    for (const accent of ['signal-green', undefined, null]) {
      document.documentElement.setAttribute('data-accent', 'plum');
      applyAccent(accent, true);
      expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
    }
  });

  it('removes data-accent when the flag is off', () => {
    document.documentElement.setAttribute('data-accent', 'plum');
    applyAccent('plum', false);
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
  });
});
