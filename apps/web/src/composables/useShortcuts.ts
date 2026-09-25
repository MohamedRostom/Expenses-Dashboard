import { onMounted, onUnmounted } from 'vue';

export interface ShortcutHandlers {
  onNew?: () => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}

/** True when the event's key matches a registered shortcut and no handler should
 * run because the user is typing into a field. Pure so it's cheap to unit test. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  // contentEditable (the IDL string property), not isContentEditable: jsdom doesn't compute
  // isContentEditable, or reflect the property to the attribute, but it does track this one.
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.contentEditable === 'true'
  );
}

/** Maps a keydown event to the handler key it should trigger, or null. Pure —
 * the composable below is just event-listener plumbing around this. */
export function matchShortcut(key: string): keyof ShortcutHandlers | null {
  if (key === 'n') return 'onNew';
  if (key === '[') return 'onPrevMonth';
  if (key === ']') return 'onNextMonth';
  return null;
}

/** Registers window-level single-key shortcuts (n, [, ]) for MonthView, ignoring
 * keystrokes while an input/textarea/select is focused. */
export function useShortcuts(handlers: ShortcutHandlers): void {
  function onKeydown(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    const action = matchShortcut(e.key);
    if (!action) return;
    const handler = handlers[action];
    if (handler) {
      e.preventDefault();
      handler();
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown));
}
