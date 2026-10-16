/** Reorder for the widget mock-up: keyboard (move earlier/later) and pointer drag share one `move`,
 * so a drag always ends in the same order as the equivalent key presses. `slotAt(clientY)` is
 * supplied by the view (it owns the element rects). */
import { ref, type Ref } from 'vue';

export function useReorder<T>(items: Ref<T[]>, slotAt: (clientY: number) => number) {
  const dragIndex = ref<number | null>(null);
  const overIndex = ref<number | null>(null);
  const clamp = (i: number) => Math.min(items.value.length - 1, Math.max(0, i));

  function move(from: number, to: number): number {
    const target = clamp(to);
    if (target === from) return from;
    const next = [...items.value];
    next.splice(target, 0, next.splice(from, 1)[0]!);
    items.value = next;
    return target;
  }

  return {
    dragIndex,
    overIndex,
    moveEarlier: (i: number) => move(i, i - 1),
    moveLater: (i: number) => move(i, i + 1),
    dragStart(index: number, e: PointerEvent) {
      dragIndex.value = index;
      overIndex.value = clamp(slotAt(e.clientY));
    },
    dragMove(e: PointerEvent) {
      if (dragIndex.value !== null) overIndex.value = clamp(slotAt(e.clientY));
    },
    dragEnd(e: PointerEvent) {
      if (dragIndex.value !== null) move(dragIndex.value, clamp(slotAt(e.clientY)));
      dragIndex.value = overIndex.value = null;
    },
  };
}
