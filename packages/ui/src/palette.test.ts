import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { PALETTE_COLOURS } from './palette.js';

const tokensCss = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf-8');

/** Pulls `--name: #hex;` out of one `{ ... }` block of tokens.css (a specific `:root` rule),
 * so light and dark values of the same custom property can be read independently even though
 * both blocks declare it under the same selector prefix. */
function valueInBlock(css: string, blockSelectorStart: number, name: string): string {
  const openBrace = css.indexOf('{', blockSelectorStart);
  const closeBrace = css.indexOf('}', openBrace);
  const block = css.slice(openBrace, closeBrace);
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token ${name} not found in block`);
  return match[1]!;
}

const lightBlockStart = tokensCss.indexOf(':root {');
const darkBlockStart = tokensCss.indexOf(":root[data-theme='dark']");

function lightValue(name: string): string {
  return valueInBlock(tokensCss, lightBlockStart, name);
}
function darkValue(name: string): string {
  return valueInBlock(tokensCss, darkBlockStart, name);
}

describe('connected-account palette contrast (FR-004, FR-024)', () => {
  const bgLight = lightValue('--color-bg');
  const bgDark = darkValue('--color-bg');

  it.each(PALETTE_COLOURS)(
    '$name meets 3:1 against the panel background in light mode',
    ({ id }) => {
      const colour = lightValue(`--palette-${id}`);
      expect(contrastRatio(colour, bgLight)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(PALETTE_COLOURS)(
    '$name meets 3:1 against the panel background in dark mode',
    ({ id }) => {
      const colour = darkValue(`--palette-${id}`);
      expect(contrastRatio(colour, bgDark)).toBeGreaterThanOrEqual(3);
    },
  );

  it('has exactly eight palette colours', () => {
    expect(PALETTE_COLOURS).toHaveLength(8);
  });
});
