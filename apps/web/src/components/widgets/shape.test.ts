import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const rule = (s: string, sel: string) => s.split(sel + ' {')[1]?.split('}')[0] ?? '';

describe('ADR-0008 shapes (widgets)', () => {
  it('the frame is a glass surface at the panel radius', () => {
    const s = src('./WidgetFrame.vue');
    expect(s).toContain('desk-widget-frame surface');
    expect(rule(s, '.desk-widget-frame')).not.toMatch(/border-radius/);
  });
  it('the unit segmented control is pills', () => {
    expect(rule(src('./WeatherSettings.vue'), '.desk-weather-unit label')).toContain(
      '--radius-pill',
    );
  });
  it('place options and the frame menu use the field radius', () => {
    expect(rule(src('./PlacePicker.vue'), '.desk-place-option')).toContain('--radius-field');
    expect(rule(src('./WidgetFrame.vue'), '.desk-widget-menu-items')).toContain('--radius-field');
  });
  it('no old small radii remain', () => {
    for (const f of ['./WidgetFrame.vue', './PlacePicker.vue', './WeatherSettings.vue'])
      expect(src(f)).not.toMatch(/--radius-(sm|md|lg)\b/);
  });
});
