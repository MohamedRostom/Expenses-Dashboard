/** ADR-0008 mock-up: the rules that let a person pick any colour without losing legibility.
 * Colours are `#rrggbb`, which is what `<input type="color">` gives. Contrast is held by
 * structure, as in ADR-0007: a colour is never rejected, it is bounded. */
import { contrastRatio } from './contrast.js';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `t` of the way from `a` to `b`. */
export const mix = (a: string, b: string, t: number) => {
  const to = rgb(b);
  return `#${rgb(a)
    .map((c, i) =>
      Math.round(c + (to[i]! - c) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/** Black or white, whichever reads better on `hex`; one of them always reaches 4.5:1. */
export const onColour = (hex: string) =>
  contrastRatio('#ffffff', hex) >= contrastRatio('#000000', hex) ? '#ffffff' : '#000000';

/** ADR-0008 numbers, kept in one place. tokens.css (--ground-cap, --glass tokens) and the composite
 * contrast test are asserted against these, so a change here without the CSS fails a test. */
/** How much of the picked tint the strongest ground stop may carry, per theme. */
export const GROUND_CAP = { light: 0.4, dark: 0.3 } as const;
/** Each ground stop as a fraction of the cap: strongest first, then the base ground. */
export const STOP_FACTORS = [1, 0.8, 0.55, 0.4, 0.5] as const;
/** The default tint, a burnt sienna. */
export const GROUND_TINT = '#a8501f';
/** Panel glass: colour and opacity, normal and strong (sidebar and top bar). */
export const GLASS = {
  light: { rgb: '#ffffff', alpha: 0.76, strong: 0.82 },
  dark: { rgb: '#1a1512', alpha: 0.7, strong: 0.84 },
} as const;

/** Four ground stops, strongest first, then the base ground. */
export function backdropStops(tint: string, dark: boolean) {
  const base = dark ? '#000000' : '#ffffff';
  const cap = dark ? GROUND_CAP.dark : GROUND_CAP.light;
  return STOP_FACTORS.map((f) => mix(base, tint, cap * f));
}
/** What a glass panel looks like over a backdrop colour. */
export const glassOver = (stop: string, dark: boolean, strong = false) => {
  const g = dark ? GLASS.dark : GLASS.light;
  return mix(stop, g.rgb, strong ? g.strong : g.alpha);
};
/** The opaque panel fallback (`--color-surface-raised`), per theme. */
export const SOLID = { light: '#ffffff', dark: '#1f242a' } as const;

/** The accent as drawn: moved toward black (light) or white (dark) until a bar in it shows at 3:1 on
 * every panel there can be over the ground: each ground stop under normal glass, and the solid
 * fallback. `tint` defaults to the worst case (black in light, white in dark). */
export function safeAccent(hex: string, dark: boolean, tint = dark ? '#ffffff' : '#000000') {
  const panels = [
    ...backdropStops(tint, dark).map((s) => glassOver(s, dark)),
    SOLID[dark ? 'dark' : 'light'],
  ];
  const toward = dark ? '#ffffff' : '#000000';
  const ok = (c: string) => panels.every((p) => contrastRatio(c, p) >= 3);
  let out = hex;
  for (let t = 0.1; !ok(out) && t <= 1; t += 0.1) out = mix(hex, toward, t);
  return out;
}
