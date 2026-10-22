import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOTION_DARK_TINT } from '@desk/contracts';
import { applyAccent, applyMotion, applyTheme } from './theme.js';

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

describe('applyMotion', () => {
  const el = document.documentElement;
  const on = { enabled: true, hidden: false };
  const prefs = {
    motionPreset: 'aurora',
    motionColour: '#c9a7ff',
    panelsTranslucent: false,
    motionPaused: true,
  } as const;
  const tint = () => el.style.getPropertyValue('--motion-tint');

  afterEach(() => {
    el.removeAttribute('data-theme');
    el.removeAttribute('data-motion');
    el.removeAttribute('data-motion-paused');
    el.removeAttribute('data-panels');
    el.style.removeProperty('--motion-tint');
    vi.unstubAllGlobals();
  });

  it('flag off: none, translucent, not paused, whatever is saved', () => {
    applyMotion(prefs, { enabled: false, hidden: false });
    expect(el.getAttribute('data-motion')).toBe('none');
    expect(el.hasAttribute('data-panels')).toBe(false);
    expect(el.hasAttribute('data-motion-paused')).toBe(false);
  });

  it('signed out: particles, mint, translucent, not paused', () => {
    applyMotion(null, on);
    expect(el.getAttribute('data-motion')).toBe('particles');
    expect(tint()).toBe('#7fd1a8');
    expect(el.hasAttribute('data-panels')).toBe(false);
    expect(el.hasAttribute('data-motion-paused')).toBe(false);
  });

  it('signed in: uses the saved preset, colour, solid panels and pause', () => {
    applyMotion(prefs, on);
    expect(el.getAttribute('data-motion')).toBe('aurora');
    expect(tint()).toBe('#c9a7ff');
    expect(el.getAttribute('data-panels')).toBe('solid');
    expect(el.hasAttribute('data-motion-paused')).toBe(true);
  });

  it('dark theme uses the dark tint whatever the saved colour', () => {
    el.setAttribute('data-theme', 'dark');
    applyMotion(prefs, on);
    expect(tint()).toBe(MOTION_DARK_TINT);
  });

  it('explicit light beats a dark system preference', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    el.setAttribute('data-theme', 'light');
    applyMotion(prefs, on);
    expect(tint()).toBe('#c9a7ff');
  });

  it('system theme follows prefers-color-scheme', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    applyMotion(prefs, on);
    expect(tint()).toBe(MOTION_DARK_TINT);
  });

  it('falls back for an unknown preset and an invalid colour', () => {
    applyMotion({ motionPreset: 'bogus', motionColour: 'red' } as never, on);
    expect(el.getAttribute('data-motion')).toBe('particles');
    expect(tint()).toBe('#7fd1a8');
  });

  it('pauses when the page is hidden', () => {
    applyMotion({ motionPreset: 'grid' }, { enabled: true, hidden: true });
    expect(el.hasAttribute('data-motion-paused')).toBe(true);
  });

  it('pauses on saveData', () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    applyMotion({ motionPreset: 'grid' }, on);
    expect(el.hasAttribute('data-motion-paused')).toBe(true);
  });
});
