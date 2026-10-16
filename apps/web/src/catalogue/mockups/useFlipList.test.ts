import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlipList } from './useFlipList.js';

function list(tops: number[]) {
  const root = document.createElement('ul');
  root.style.setProperty('--motion-base', '200ms');
  const items = tops.map((top, i) => {
    const li = document.createElement('li');
    li.dataset['flip'] = String(i);
    li.getBoundingClientRect = () => ({ left: 0, top }) as DOMRect;
    root.append(li);
    return li;
  });
  return { root, items };
}
const reduce = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: matches && q.includes('reduce') }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useFlipList', () => {
  it('turns the first/last rect diff into an inverse translate, then cleans up after --motion-base', () => {
    reduce(false);
    const { root, items } = list([0, 40]);
    const flip = useFlipList(() => root);
    flip.first();
    // the second item moved up 40px since first()
    items[1]!.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    flip.play();
    expect(items[1]!.style.transform).toBe('translate(0px, 40px)');
    expect(items[0]!.style.transform).toBe('');
    vi.advanceTimersByTime(20); // next frame: transition toward identity starts
    expect(items[1]!.style.transition).toContain('var(--motion-base)');
    expect(items[1]!.style.transform).toBe('');
    vi.advanceTimersByTime(200);
    expect(items[1]!.style.transition).toBe('');
    expect(items[1]!.style.transform).toBe('');
  });

  it('is a no-op under prefers-reduced-motion', () => {
    reduce(true);
    const { root, items } = list([0, 40]);
    const flip = useFlipList(() => root);
    flip.first();
    items[1]!.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    flip.play();
    expect(items[1]!.style.transform).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });
});
