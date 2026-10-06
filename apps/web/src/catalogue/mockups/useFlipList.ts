/** FLIP for a list that reorders (DESIGN.md §Motion). Call `first()` before the DOM changes and
 * `play()` after it (nextTick). Children are matched by `data-flip`; each gets an inverse translate
 * for one frame, then glides to identity over --motion-base, and its inline styles are cleaned up.
 * A no-op under prefers-reduced-motion. */
export function useFlipList(root: () => HTMLElement | null) {
  const firsts = new Map<string, { x: number; y: number }>();
  const items = () => [...(root()?.querySelectorAll<HTMLElement>('[data-flip]') ?? [])];
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  function first() {
    firsts.clear();
    for (const el of items()) {
      const r = el.getBoundingClientRect();
      firsts.set(el.dataset['flip']!, { x: r.left, y: r.top });
    }
  }

  function play() {
    const el0 = root();
    if (!el0 || reduced()) return;
    const base = parseFloat(getComputedStyle(el0).getPropertyValue('--motion-base')) || 200;
    for (const el of items()) {
      const f = firsts.get(el.dataset['flip']!);
      if (!f) continue;
      const r = el.getBoundingClientRect();
      const dx = f.x - r.left;
      const dy = f.y - r.top;
      if (!dx && !dy) continue;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      setTimeout(() => {
        el.style.transition = 'transform var(--motion-base) var(--ease-standard)';
        el.style.transform = '';
        setTimeout(() => el.style.removeProperty('transition'), base);
      }, 16);
    }
    firsts.clear();
  }

  return { first, play };
}
