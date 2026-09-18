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
