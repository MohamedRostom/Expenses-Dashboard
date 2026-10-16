// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import Button from './Button.vue';
import { readFileSync } from 'node:fs';

function mount(props: Record<string, unknown>) {
  const el = document.createElement('div');
  createApp(Button, props).mount(el);
  return el.querySelector('button')!;
}

const source = readFileSync('src/components/Button.vue', 'utf8');

describe('Button', () => {
  it('defaults to primary, type=button, not busy', async () => {
    const b = mount({});
    await nextTick();
    expect(b.className).toContain('primary');
    expect(b.type).toBe('button');
    expect(b.getAttribute('aria-busy')).toBe('false');
  });
  it('loading sets aria-busy, disables, and shows a spinner beside the content', async () => {
    const b = mount({ loading: true });
    await nextTick();
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.disabled).toBe(true);
    expect(b.querySelector('.desk-btn-spinner')).not.toBeNull();
  });
  it('keeps its width while loading: the spinner is out of flow', () => {
    expect(source).toMatch(/\.desk-btn-spinner\s*\{[^}]*position:\s*absolute/);
  });
  it('accepts the opt-in ghost variant and sm size', async () => {
    const b = mount({ variant: 'ghost', size: 'sm' });
    await nextTick();
    expect(b.classList.contains('ghost')).toBe(true);
    expect(b.classList.contains('sm')).toBe(true);
  });
  it('md size adds no extra class so the default render is unchanged', async () => {
    expect(mount({}).classList.contains('md')).toBe(false);
  });
});
