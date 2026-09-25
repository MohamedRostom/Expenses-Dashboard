import { describe, expect, it, vi } from 'vitest';
import { useToast } from './useToast.js';

describe('useToast', () => {
  it('push adds a toast and dismiss removes it', () => {
    const { toasts, push, dismiss } = useToast();
    const before = toasts.length;
    const id = push('Saved', 'info', 60_000);
    expect(toasts.length).toBe(before + 1);
    expect(toasts.at(-1)).toMatchObject({ id, text: 'Saved', variant: 'info' });

    dismiss(id);
    expect(toasts.find((t) => t.id === id)).toBeUndefined();
  });

  it('auto-dismisses after ttlMs', () => {
    vi.useFakeTimers();
    try {
      const { toasts, push } = useToast();
      const id = push('Expiring', 'critical', 1000);
      expect(toasts.find((t) => t.id === id)).toBeTruthy();
      vi.advanceTimersByTime(1000);
      expect(toasts.find((t) => t.id === id)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults to variant "info" when none is given', () => {
    const { toasts, push, dismiss } = useToast();
    const id = push('Plain');
    expect(toasts.find((t) => t.id === id)?.variant).toBe('info');
    dismiss(id);
  });
});
