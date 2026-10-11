import { ACCENT_IDS } from '@desk/contracts';

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
