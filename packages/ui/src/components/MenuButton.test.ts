// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import MenuButton from './MenuButton.vue';

const items = [
  { id: 'edit', label: 'Edit' },
  { id: 'hide', label: 'Hide' },
  { id: 'del', label: 'Remove' },
];
function mount(onSelect: (id: string) => void = () => {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  createApp(MenuButton, { items, label: 'Panel actions', onSelect }).mount(el);
  return el;
}
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('MenuButton', () => {
  it('trigger has haspopup=menu, expanded false and an accessible name', async () => {
    const el = mount();
    await nextTick();
    const b = el.querySelector('button')!;
    expect(b.getAttribute('aria-haspopup')).toBe('menu');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-label')).toBe('Panel actions');
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });
  it('click opens and focuses the first item; arrows move; Esc closes and refocuses the trigger', async () => {
    const el = mount();
    const b = el.querySelector('button')!;
    b.click();
    await nextTick();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    const menuitems = () => [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(menuitems().length).toBe(3);
    expect(document.activeElement).toBe(menuitems()[0]);
    key(menuitems()[0]!, 'ArrowDown');
    await nextTick();
    expect(document.activeElement).toBe(menuitems()[1]);
    key(menuitems()[1]!, 'ArrowUp');
    await nextTick();
    key(menuitems()[0]!, 'ArrowUp');
    await nextTick();
    expect(document.activeElement).toBe(menuitems()[2]);
    key(menuitems()[2]!, 'Escape');
    await nextTick();
    expect(el.querySelector('[role="menu"]')).toBeNull();
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(b);
  });
  it('ArrowDown on the trigger opens; choosing an item emits select and closes', async () => {
    const got: string[] = [];
    const el = mount((id) => got.push(id));
    const b = el.querySelector('button')!;
    key(b, 'ArrowDown');
    await nextTick();
    el.querySelectorAll<HTMLElement>('[role="menuitem"]')[1]!.click();
    await nextTick();
    expect(got).toEqual(['hide']);
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });
});
