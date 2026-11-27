import { ACCENT_IDS, FONT_IDS, MOTION_DARK_TINT, MOTION_PRESET_IDS } from '@desk/contracts';
import { GROUND_TINT, onColour, safeAccent } from '@desk/ui';

/** Maps a user theme preference to the DOM attribute value per CLAUDE.md's
 * three-state convention. 'system' removes data-theme so prefers-color-scheme
 * takes over; 'light'/'dark' set it explicitly. */
export function applyTheme(theme: string): void {
  if (typeof document === 'undefined') return;
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

/** Sets the user's accent preset on <html> (spec 004 US5, FR-019). Signal Green is the default and
 * has no CSS block, and with `appearance.accent` off no preset may show, so both remove the
 * attribute; an id outside ACCENT_IDS does too. */
export function applyAccent(accent: string | null | undefined, enabled: boolean): void {
  if (typeof document === 'undefined') return;
  const preset = (ACCENT_IDS as readonly string[]).includes(accent ?? '') ? accent : undefined;
  if (enabled && preset && preset !== 'signal-green') {
    document.documentElement.setAttribute('data-accent', preset);
  } else {
    document.documentElement.removeAttribute('data-accent');
  }
}

export interface FreeColours {
  accentCustom?: string | null | undefined;
  groundTint?: string | null | undefined;
  navColour?: string | null | undefined;
}

const HEX = /^#[0-9a-f]{6}$/i;
const hexOrNull = (v: string | null | undefined) => (v && HEX.test(v) ? v.toLowerCase() : null);

/** Free colours (ADR-0008): the accent, the ground's tint and the selected nav item, as inline
 * variables on <html>. A colour is never rejected: text on it is black or white (`onColour`) and
 * the accent is drawn nudged until a bar in it shows (`safeAccent`). A null colour removes its
 * variables, so the preset accent / default tint / default nav highlight come back. `prefs` null
 * (signed out) or the flag off removes all of them. Call again when the theme changes. */
export function applyFreeColours(prefs: FreeColours | null, enabled: boolean): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  const set = (names: string[], values: string[] | null) =>
    names.forEach((n, i) => (values ? style.setProperty(n, values[i]!) : style.removeProperty(n)));
  const on = enabled && prefs !== null;
  const tint = on ? hexOrNull(prefs.groundTint) : null;
  const accent = on ? hexOrNull(prefs.accentCustom) : null;
  const nav = on ? hexOrNull(prefs.navColour) : null;
  const drawn = accent ? safeAccent(accent, isDark(), tint ?? GROUND_TINT) : null;
  set(['--ground-tint'], tint ? [tint] : null);
  set(['--color-accent', '--color-accent-fg'], drawn ? [drawn, onColour(drawn)] : null);
  set(['--nav-colour', '--nav-colour-fg'], nav ? [nav, onColour(nav)] : null);
}

export interface MotionPrefs {
  motionPreset?: string;
  motionColour?: string;
  panelsTranslucent?: boolean;
  motionPaused?: boolean;
}

const DEFAULT_TINT = '#7fd1a8';

/** Effective theme: explicit data-theme wins, otherwise the system preference (same split as applyTheme). */
function isDark(): boolean {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit) return explicit === 'dark';
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Writes the effective background-motion state on <html> (spec 006, data-model Resolution rules).
 * `prefs` null means signed out (defaults). Flag off means still ground and translucent panels
 * whatever is saved. `hidden` is document.hidden, supplied by the caller's visibility listener. */
export function applyMotion(
  prefs: MotionPrefs | null,
  opts: { enabled: boolean; hidden: boolean },
): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const on = opts.enabled;
  const preset = (MOTION_PRESET_IDS as readonly string[]).includes(prefs?.motionPreset ?? '')
    ? prefs!.motionPreset!
    : 'particles';
  const saved = /^#[0-9a-f]{6}$/i.test(prefs?.motionColour ?? '')
    ? prefs!.motionColour!
    : DEFAULT_TINT;
  const saveData =
    (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;

  el.setAttribute('data-motion', on ? preset : 'none');
  el.style.setProperty('--motion-tint', isDark() ? MOTION_DARK_TINT : saved);
  if (on && prefs?.panelsTranslucent === false) el.setAttribute('data-panels', 'solid');
  else el.removeAttribute('data-panels');
  if (on && (prefs?.motionPaused === true || opts.hidden || saveData)) {
    el.setAttribute('data-motion-paused', '');
  } else {
    el.removeAttribute('data-motion-paused');
  }
}

/** Page font on <html> (Settings › Appearance): tokens.css maps each `data-font` to one stack for
 * words and figures. System, an unknown id, signed out (null) or `appearance.accent` off removes
 * it, so the default stacks come back. */
export function applyFont(font: string | null | undefined, enabled: boolean): void {
  if (typeof document === 'undefined') return;
  const known = (FONT_IDS as readonly string[]).includes(font ?? '');
  if (enabled && known && font !== 'system') {
    document.documentElement.setAttribute('data-font', font!);
  } else {
    document.documentElement.removeAttribute('data-font');
  }
}
