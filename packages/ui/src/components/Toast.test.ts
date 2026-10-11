// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Toast from './Toast.vue';
import { useToast } from '../composables/useToast.js';

const { toasts, push } = useToast();
beforeEach(() => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Toast).mount(host);
});
afterEach(() => {
  toasts.splice(0);
  vi.useRealTimers();
  document.body.innerHTML = '';
});
const el = (sel = '.desk-toast') => document.querySelector<HTMLElement>(sel);
// A leaving toast stays in the DOM until its transition ends (jsdom never fires it).
const gone = () => {
  const e = el();
  return !e || e.className.includes('leave');
};

describe('Toast', () => {
  it('animates enter and leave through a TransitionGroup named desk-toast', async () => {
    push('a');
    await nextTick();
    expect(el()!.className).toContain('desk-toast-enter');
  });

  it('is a status, alert when critical', async () => {
    push('a', 'info');
    push('b', 'critical');
    await nextTick();
    const [a, b] = document.querySelectorAll('.desk-toast');
    expect(a!.getAttribute('role')).toBe('status');
    expect(b!.getAttribute('role')).toBe('alert');
  });

  it('keeps the current default: no undo button, 4 s timeout', async () => {
    push('a');
    await nextTick();
    expect(el('.desk-toast button')).toBeNull();
    vi.advanceTimersByTime(4000);
    await nextTick();
    expect(gone()).toBe(true);
  });

  it('undo button is focusable, runs the action and dismisses', async () => {
    const undo = vi.fn();
    push('Deleted', 'success', undefined, undo);
    await nextTick();
    const btn = el('.desk-toast button')!;
    expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
    btn.click();
    await nextTick();
    expect(undo).toHaveBeenCalledOnce();
    expect(gone()).toBe(true);
  });

  it('with undo, dismisses at 6 s, paused while hovered and while focused', async () => {
    push('Deleted', 'info', undefined, () => {});
    await nextTick();
    vi.advanceTimersByTime(5000);
    el()!.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(10_000);
    await nextTick();
    expect(el()).not.toBeNull();
    el()!.dispatchEvent(new MouseEvent('mouseleave'));
    el()!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(10_000);
    await nextTick();
    expect(el()).not.toBeNull();
    el()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    vi.advanceTimersByTime(999);
    await nextTick();
    expect(el()).not.toBeNull();
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(gone()).toBe(true);
  });

  it('has a success tone class', async () => {
    push('ok', 'success');
    await nextTick();
    expect(el()!.classList.contains('success')).toBe(true);
  });
});
