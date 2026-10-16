// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import Tabs from './Tabs.vue';

const tabs = [
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'cats', label: 'Categories' },
];
function mount(modelValue: string, onUpdate: (v: string) => void = () => {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  createApp(Tabs, { tabs, modelValue, label: 'Views', 'onUpdate:modelValue': onUpdate }).mount(el);
  return el;
}
const press = (el: Element, key: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

describe('Tabs', () => {
  it('has tablist, tabs with aria-selected, and a labelled tabpanel', async () => {
    const el = mount('year');
    await nextTick();
    expect(el.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('Views');
    const t = [...el.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(t.map((x) => x.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(t.map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
    const panel = el.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(t[1]!.id);
    expect(t[1]!.getAttribute('aria-controls')).toBe(panel.id);
  });
  it('arrow keys, Home and End move selection with wrap', async () => {
    const got: string[] = [];
    const el = mount('month', (v) => got.push(v));
    await nextTick();
    const first = el.querySelector('[role="tab"]')!;
    press(first, 'ArrowRight');
    press(first, 'ArrowLeft');
    press(first, 'End');
    press(first, 'Home');
    expect(got).toEqual(['year', 'cats', 'cats', 'month']);
  });
  it('click selects', async () => {
    const got: string[] = [];
    const el = mount('month', (v) => got.push(v));
    await nextTick();
    el.querySelectorAll<HTMLElement>('[role="tab"]')[2]!.click();
    expect(got).toEqual(['cats']);
  });
});
