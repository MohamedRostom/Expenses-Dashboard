import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOTION_DARK_TINT } from '@desk/contracts';
import { contrastRatio, GROUND_TINT, onColour, safeAccent } from '@desk/ui';
import { applyAccent, applyFont, applyFreeColours, applyMotion, applyTheme } from './theme.js';

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

describe('applyFreeColours (ADR-0008)', () => {
  const el = document.documentElement;
  const v = (k: string) => el.style.getPropertyValue(k);
  const VARS = [
    '--color-accent',
    '--color-accent-fg',
    '--ground-tint',
    '--nav-colour',
    '--nav-colour-fg',
  ];
  const picked = { accentCustom: '#e8c11a', groundTint: '#2244aa', navColour: '#ff3366' };

  afterEach(() => {
    el.removeAttribute('data-theme');
    for (const k of VARS) el.style.removeProperty(k);
    vi.unstubAllGlobals();
  });

  it('sets every variable from the picked colours', () => {
    applyFreeColours(picked, true);
    expect(v('--ground-tint')).toBe('#2244aa');
    expect(v('--nav-colour')).toBe('#ff3366');
    expect(v('--nav-colour-fg')).toBe(onColour('#ff3366'));
    const drawn = safeAccent('#e8c11a', false, '#2244aa');
    expect(v('--color-accent')).toBe(drawn);
    expect(v('--color-accent-fg')).toBe(onColour(drawn));
  });

  it('the accent text is black or white and reaches 4.5:1 on the drawn accent, for any pick', () => {
    for (const hex of ['#000000', '#ffffff', '#e8c11a', '#808080', '#0e3d2a', '#ff0000']) {
      for (const theme of ['light', 'dark']) {
        el.setAttribute('data-theme', theme);
        applyFreeColours({ accentCustom: hex, groundTint: null, navColour: null }, true);
        expect(['#000000', '#ffffff']).toContain(v('--color-accent-fg'));
        expect(contrastRatio(v('--color-accent-fg'), v('--color-accent'))).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it('draws the accent against the default tint when only the accent is picked', () => {
    applyFreeColours({ accentCustom: '#ffee00', groundTint: null, navColour: null }, true);
    expect(v('--color-accent')).toBe(safeAccent('#ffee00', false, GROUND_TINT));
  });

  it('dark follows the explicit theme, then the system preference', () => {
    el.setAttribute('data-theme', 'dark');
    applyFreeColours({ ...picked, groundTint: null }, true);
    expect(v('--color-accent')).toBe(safeAccent('#e8c11a', true, GROUND_TINT));
    el.removeAttribute('data-theme');
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    applyFreeColours({ ...picked, groundTint: null }, true);
    expect(v('--color-accent')).toBe(safeAccent('#e8c11a', true, GROUND_TINT));
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    applyFreeColours({ ...picked, groundTint: null }, true);
    expect(v('--color-accent')).toBe(safeAccent('#e8c11a', false, GROUND_TINT));
  });

  it('removes a variable when its colour is null, independently of the others', () => {
    applyFreeColours(picked, true);
    applyFreeColours({ ...picked, accentCustom: null }, true);
    expect(v('--color-accent')).toBe('');
    expect(v('--color-accent-fg')).toBe('');
    expect(v('--ground-tint')).toBe('#2244aa');
    expect(v('--nav-colour')).toBe('#ff3366');
    applyFreeColours({ accentCustom: null, groundTint: null, navColour: null }, true);
    for (const k of VARS) expect(v(k)).toBe('');
  });

  it('removes everything when signed out (null) or the flag is off', () => {
    applyFreeColours(picked, true);
    applyFreeColours(null, true);
    for (const k of VARS) expect(v(k)).toBe('');
    applyFreeColours(picked, true);
    applyFreeColours(picked, false);
    for (const k of VARS) expect(v(k)).toBe('');
  });

  it('ignores a value that is not #rrggbb', () => {
    applyFreeColours({ accentCustom: 'red', groundTint: '#fff', navColour: undefined }, true);
    for (const k of VARS) expect(v(k)).toBe('');
  });
});

describe('applyFont (page font setting)', () => {
  afterEach(() => document.documentElement.removeAttribute('data-font'));

  it('sets data-font for a chosen font, which tokens.css maps for words and figures', () => {
    applyFont('serif', true);
    expect(document.documentElement.getAttribute('data-font')).toBe('serif');
  });
  it('removes it for system, an unknown id, signed out (null) or the flag off', () => {
    for (const [font, on] of [
      ['system', true],
      ['comic', true],
      [null, true],
      ['serif', false],
    ] as const) {
      document.documentElement.setAttribute('data-font', 'rounded');
      applyFont(font, on);
      expect(document.documentElement.hasAttribute('data-font')).toBe(false);
    }
  });
});
