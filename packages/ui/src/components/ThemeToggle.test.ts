// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import ThemeToggle from './ThemeToggle.vue';

function mount(modelValue: string, onUpdate: (v: string) => void = () => {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  createApp(ThemeToggle, { modelValue, 'onUpdate:modelValue': onUpdate }).mount(el);
  return el;
}

describe('ThemeToggle', () => {
  it('is a radiogroup of system, light, dark with the model checked', async () => {
    const el = mount('light');
    await nextTick();
    expect(el.querySelector('[role="radiogroup"]')).not.toBeNull();
    const radios = [...el.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((r) => r.dataset.value)).toEqual(['system', 'light', 'dark']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });
  it('emits the clicked choice (the screen calls applyTheme)', async () => {
    const got: string[] = [];
    const el = mount('system', (v) => got.push(v));
    await nextTick();
    el.querySelectorAll<HTMLElement>('[role="radio"]')[2]!.click();
    expect(got).toEqual(['dark']);
  });
  it('arrow keys move and emit, wrapping at the ends', async () => {
    const got: string[] = [];
    const el = mount('system', (v) => got.push(v));
    await nextTick();
    const first = el.querySelector('[role="radio"]')!;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(got).toEqual(['light', 'dark']);
  });
});
