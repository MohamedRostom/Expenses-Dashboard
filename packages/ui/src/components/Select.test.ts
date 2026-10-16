// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import Select from './Select.vue';

const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
];

describe('Select', () => {
  it('is a native select that emits the chosen value', async () => {
    let got = '';
    const el = document.createElement('div');
    createApp(Select, {
      options,
      label: 'Pick',
      'onUpdate:modelValue': (v: string) => (got = v),
    }).mount(el);
    await nextTick();
    const sel = el.querySelector('select')!;
    expect(sel.getAttribute('aria-invalid')).toBe('false');
    sel.value = 'b';
    sel.dispatchEvent(new Event('change'));
    expect(got).toBe('b');
  });
  it('invalid sets aria-invalid and links the message', async () => {
    const el = document.createElement('div');
    createApp(Select, { options, error: 'Required' }).mount(el);
    await nextTick();
    const sel = el.querySelector('select')!;
    expect(sel.getAttribute('aria-invalid')).toBe('true');
    const id = sel.getAttribute('aria-describedby')!;
    expect(el.querySelector(`[id="${id}"]`)!.textContent).toBe('Required');
  });
});
