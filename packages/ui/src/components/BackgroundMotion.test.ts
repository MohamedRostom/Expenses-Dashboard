// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import BackgroundMotion from './BackgroundMotion.vue';

const source = readFileSync(join(process.cwd(), 'src/components/BackgroundMotion.vue'), 'utf-8');
const css = source.split('<style')[1] ?? '';
const presets = ['aurora', 'grid', 'particles', 'grain'];

describe('BackgroundMotion', () => {
  it('is an inert, hidden-from-AT layer with a test id', async () => {
    const el = document.createElement('div');
    createApp(BackgroundMotion).mount(el);
    await nextTick();
    const root = el.firstElementChild!;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.getAttribute('data-testid')).toBe('background-motion');
  });

  it('has a rule per preset keyed on the html data-motion attribute', () => {
    for (const p of presets) expect(css).toContain(`[data-motion='${p}']`);
    expect(css).not.toContain(`[data-motion='none']`);
  });

  it('draws with the alpha tokens and --motion-tint, never colour literals', () => {
    for (const t of ['aurora', 'aurora-blue', 'aurora-amber', 'grid', 'particles', 'grain'])
      expect(css).toContain(`var(--motion-alpha-${t})`);
    expect(css).toContain('var(--motion-tint');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });

  it('animates transform and opacity only', () => {
    const frames = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?\n {2}\})/g)].map((m) => m[1]!);
    expect(frames.length).toBeGreaterThanOrEqual(5);
    for (const f of frames)
      for (const prop of f.matchAll(/([a-z-]+)\s*:/g))
        expect(['transform', 'opacity']).toContain(prop[1]);
  });

  it('is fixed, inert, behind content and hidden in print and forced colours', () => {
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/pointer-events:\s*none/);
    expect(css).toMatch(/z-index:\s*-1/);
    expect(css).toMatch(/@media print\s*\{[^}]*\{[^}]*display:\s*none/);
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{[^}]*\{[^}]*display:\s*none/);
  });

  it('holds still when paused, reduced-motion or reduced-data', () => {
    expect(css).toContain(':root[data-motion-paused]');
    expect(css).toMatch(/animation-play-state:\s*paused/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
    expect(css).toMatch(/@media \(prefers-reduced-data: reduce\)[\s\S]*animation:\s*none/);
  });

  it('exposes the still thumbnail rules for the settings radios', () => {
    for (const p of presets) expect(css).toContain(`.motion-thumb[data-preset='${p}']`);
  });
});
