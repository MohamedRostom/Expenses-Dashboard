import { nextTick, onMounted, watch, type Ref } from 'vue';

/** Dialog behaviour for the mock-up sheets: focus goes in on open, Tab is trapped, Escape asks to
 * close, and `restore()` hands focus back to the opener (or `fallback` when the opener did not
 * survive, e.g. a route change). With `open` the dialog opens and closes in place and restores by
 * itself; without it the dialog is open from mount and the caller calls `restore()` when done. */
interface Options {
  open?: () => boolean;
  close: () => void;
  fallback?: () => HTMLElement | null;
}
const FOCUSABLE = 'button, select, input, [href], [tabindex]:not([tabindex="-1"])';

const current = () => {
  const a = document.activeElement;
  return a instanceof HTMLElement && a !== document.body ? a : null;
};

export function useDialog(panel: Ref<HTMLElement | null>, o: Options) {
  // the opener still holds focus: nothing has moved it yet
  let opener = current();
  const focusables = () =>
    [...(panel.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
      (e) => e.getAttribute('aria-disabled') !== 'true',
    );
  const focusIn = () => (focusables()[0] ?? panel.value)?.focus();

  function restore() {
    (opener?.isConnected ? opener : o.fallback?.())?.focus();
    opener = null;
  }

  if (o.open) {
    watch(
      o.open,
      async (now, was) => {
        if (now && !was) {
          opener = current();
          await nextTick();
          focusIn();
        } else if (!now && was) restore();
      },
      { flush: 'post' },
    );
    if (o.open()) nextTick(focusIn);
  } else onMounted(focusIn);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      o.close();
    } else if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return e.preventDefault();
      const at = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        f[f.length - 1]!.focus();
      } else if (!e.shiftKey && at === f.length - 1) {
        e.preventDefault();
        f[0]!.focus();
      }
    }
  }
  return { onKey, restore };
}
