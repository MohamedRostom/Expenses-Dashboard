import { describe, expect, it } from 'vitest';

// Embedded browsers, installed PWAs and browsers with dialogs suppressed answer confirm() with
// false at once and show nothing, so a "Remove" behind it silently does nothing. Ask in the app.
const sources = import.meta.glob('./**/*.{vue,ts}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// The lookahead skips a method declaration such as `prompt(): Promise<void>`.
const NATIVE = /(?<![\w.$])(?:window\.)?(?:confirm|alert|prompt)\s*\((?![^)]*\)\s*:)/;

describe('no native browser dialogs in apps/web/src', () => {
  it('scans real files', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('no non-test file calls confirm(, alert( or prompt(', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.ts$/.test(path))
      .filter(([, text]) => NATIVE.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
