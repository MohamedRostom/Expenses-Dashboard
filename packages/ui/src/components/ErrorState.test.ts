// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ErrorState from './ErrorState.vue';

describe('ErrorState lamp (DESIGN.md: no side stripes)', () => {
  it('has a lamp before the title, a role and the title word, with a full border', () => {
    const el = document.createElement('div');
    createApp({ render: () => h(ErrorState, { code: 'not_found' }) }).mount(el);
    const root = el.firstElementChild!;
    expect(root.getAttribute('role')).toBe('alert');
    expect(root.querySelector('.desk-error-lamp')).not.toBeNull();
    expect(root.querySelector('.desk-error-title')!.textContent).toBe('Not found');
    const src = readFileSync('src/components/ErrorState.vue', 'utf8');
    expect(src).not.toMatch(/border-inline-start:\s*4px/);
  });
});

describe('ErrorState', () => {
  it('is role=alert on first render only', async () => {
    const code = ref('not_found');
    const el = document.createElement('div');
    createApp({ render: () => h(ErrorState, { code: code.value }) }).mount(el);
    const root = () => el.firstElementChild!;
    expect(root().getAttribute('role')).toBe('alert');
    await nextTick();
    expect(root().getAttribute('role')).toBeNull();
    code.value = 'conflict';
    await nextTick();
    expect(root().getAttribute('role')).toBeNull();
    expect(root().textContent).toContain('Conflict');
  });
});
