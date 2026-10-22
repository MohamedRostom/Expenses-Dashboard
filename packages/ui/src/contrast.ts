/** WCAG relative-luminance contrast ratio between two `#rrggbb` colours (used by
 * palette.test.ts to check the connected-account palette against the panel background,
 * FR-004/FR-024). Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** `fg` at `alpha` (0..1) composited over opaque `bg`, as `#rrggbb` (SC-004 worst-case backdrops). */
export function compositeOver(fg: string, alpha: number, bg: string): string {
  const ch = (hex: string, i: number): number => parseInt(hex.replace('#', '').slice(i, i + 2), 16);
  return (
    '#' +
    [0, 2, 4]
      .map((i) =>
        Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
