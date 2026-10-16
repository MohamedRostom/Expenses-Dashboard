import { reactive } from 'vue';

export interface ToastMessage {
  id: number;
  text: string;
  variant?: 'info' | 'success' | 'warn' | 'critical';
  /** Opt-in: shows an Undo button. */
  undo?: () => void;
}

let nextId = 1;
const toasts = reactive<ToastMessage[]>([]);
// Timer bookkeeping lives outside the reactive list so pausing never triggers a render.
const timers = new Map<
  number,
  { handle: ReturnType<typeof setTimeout>; end: number; left: number }
>();

function schedule(id: number, ms: number) {
  const handle = setTimeout(() => dismiss(id), ms);
  timers.set(id, { handle, end: Date.now() + ms, left: ms });
}
function dismiss(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t.handle);
  timers.delete(id);
  const i = toasts.findIndex((m) => m.id === id);
  if (i !== -1) toasts.splice(i, 1);
}
function pause(id: number) {
  const t = timers.get(id);
  if (!t) return;
  clearTimeout(t.handle);
  t.left = Math.max(0, t.end - Date.now());
}
function resume(id: number) {
  const t = timers.get(id);
  if (t) schedule(id, t.left);
}

/** Minimal toast composable: shared reactive queue, no store framework needed. A toast with an
 * undo action defaults to 6 s (contracts/blocks.md); without one it stays at 4 s as before. */
export function useToast() {
  function push(
    text: string,
    variant: ToastMessage['variant'] = 'info',
    ttlMs?: number,
    undo?: () => void,
  ) {
    const id = nextId++;
    toasts.push(undo ? { id, text, variant, undo } : { id, text, variant });
    schedule(id, ttlMs ?? (undo ? 6000 : 4000));
    return id;
  }
  return { toasts, push, dismiss, pause, resume };
}
