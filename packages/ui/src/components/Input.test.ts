// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import Input from './Input.vue';

function mount(props: Record<string, unknown>) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  createApp(Input, props).mount(el);
  return el;
}

describe('Input', () => {
  it('is valid by default', async () => {
    const el = mount({ label: 'Amount' });
    await nextTick();
    const input = el.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
  it('invalid sets aria-invalid and points aria-describedby at the message', async () => {
    const el = mount({ label: 'Amount', error: 'Enter a number' });
    await nextTick();
    const input = el.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const id = input.getAttribute('aria-describedby')!;
    expect(id).toBeTruthy();
    expect(el.querySelector(`[id="${id}"]`)!.textContent).toBe('Enter a number');
  });
  it('emits update:modelValue', async () => {
    let got = '';
    const el = document.createElement('div');
    createApp(Input, { 'onUpdate:modelValue': (v: string) => (got = v) }).mount(el);
    const input = el.querySelector('input')!;
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    expect(got).toBe('42');
  });
});
