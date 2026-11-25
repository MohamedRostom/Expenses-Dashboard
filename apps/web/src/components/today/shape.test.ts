import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const rule = (s: string, sel: string) => s.split(sel + ' {')[1]?.split('}')[0] ?? '';

describe('ADR-0008 shapes (today)', () => {
  it('account chips and the refresh button are pills', () => {
    expect(rule(src('./AccountChip.vue'), '.account-chip')).toContain('--radius-pill');
    expect(rule(src('./InboxPanel.vue'), '.refresh-button')).toContain('--radius-pill');
  });
  it('the colour dot is a round inner detail', () => {
    expect(rule(src('./AccountChip.vue'), '.chip-color')).toContain('--radius-pill');
  });
});
