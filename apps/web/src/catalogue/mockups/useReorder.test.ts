import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useReorder } from './useReorder.js';

const abcd = () => ref(['a', 'b', 'c', 'd']);
const ptr = (y: number) => ({ clientY: y }) as PointerEvent;

describe('useReorder', () => {
  it('moves earlier and later by one', () => {
    const items = abcd();
    const r = useReorder(items, () => 0);
    expect(r.moveLater(0)).toBe(1);
    expect(items.value).toEqual(['b', 'a', 'c', 'd']);
    expect(r.moveEarlier(1)).toBe(0);
    expect(items.value).toEqual(['a', 'b', 'c', 'd']);
  });

  it('clamps at both ends', () => {
    const items = abcd();
    const r = useReorder(items, () => 0);
    expect(r.moveEarlier(0)).toBe(0);
    expect(r.moveLater(3)).toBe(3);
    expect(items.value).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a drag gives the same order as the equivalent keyboard moves', () => {
    const kb = abcd();
    const k = useReorder(kb, () => 0);
    k.moveLater(0);
    k.moveLater(1);

    const dragged = abcd();
    // slots are 10px tall: y 25 is slot 2
    const d = useReorder(dragged, (y) => Math.floor(y / 10));
    d.dragStart(0, ptr(5));
    expect(d.dragIndex.value).toBe(0);
    d.dragMove(ptr(25));
    expect(d.overIndex.value).toBe(2);
    d.dragEnd(ptr(25));
    expect(dragged.value).toEqual(kb.value);
    expect(d.dragIndex.value).toBeNull();
  });

  it('a drag past either end clamps', () => {
    const items = abcd();
    const d = useReorder(items, (y) => Math.floor(y / 10));
    d.dragStart(3, ptr(35));
    d.dragMove(ptr(-50));
    d.dragEnd(ptr(-50));
    expect(items.value).toEqual(['d', 'a', 'b', 'c']);
  });
});
