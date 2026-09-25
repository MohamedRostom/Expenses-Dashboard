import { reactive } from 'vue';

export interface ToastMessage {
  id: number;
  text: string;
  variant?: 'info' | 'warn' | 'critical';
}

let nextId = 1;
const toasts = reactive<ToastMessage[]>([]);

/** Minimal toast composable: shared reactive queue, no store framework needed. */
export function useToast() {
  function push(text: string, variant: ToastMessage['variant'] = 'info', ttlMs = 4000) {
    const id = nextId++;
    toasts.push({ id, text, variant });
    setTimeout(() => dismiss(id), ttlMs);
    return id;
  }
  function dismiss(id: number) {
    const i = toasts.findIndex((t) => t.id === id);
    if (i !== -1) toasts.splice(i, 1);
  }
  return { toasts, push, dismiss };
}
