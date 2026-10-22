import { describe, expect, it } from 'vitest';
import { MOTION_DARK_TINT, MOTION_PRESET_IDS, MOTION_SWATCHES } from './motion.js';

describe('motion presets', () => {
  it('lists the five ids in order, particles is the default', () => {
    expect(MOTION_PRESET_IDS).toEqual(['none', 'aurora', 'grid', 'particles', 'grain']);
  });

  it('has six swatches, signal mint first and lowercase hex', () => {
    expect(MOTION_SWATCHES).toHaveLength(6);
    expect(MOTION_SWATCHES[0]).toEqual({ id: 'signal-mint', hex: '#7fd1a8' });
    for (const s of MOTION_SWATCHES) expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('tints dark mode with signal mint', () => {
    expect(MOTION_DARK_TINT).toBe('#7fd1a8');
  });
});
