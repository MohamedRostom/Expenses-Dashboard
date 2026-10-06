import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialog } from './useDialog.js';

const open = ref(false);
const close = vi.fn();
let dlg: ReturnType<typeof useDialog>;
const Host = defineComponent({
  setup() {
    const panel = ref<HTMLElement | null>(null);
    dlg = useDialog(panel, { open: () => open.value, close });
    return () =>
      h('div', [
        h('button', { id: 'opener' }, 'open'),
        open.value
          ? h('div', { ref: panel, tabindex: -1, onKeydown: dlg.onKey }, [
              h('button', { id: 'a' }, 'a'),
              h('button', { id: 'b' }, 'b'),
            ])
          : null,
      ]);
  },
});
let host: HTMLElement;
const $ = (id: string) => document.getElementById(id)!;
const key = (el: HTMLElement, k: string, shiftKey = false) => {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};
async function mount() {
  open.value = false;
  host = document.createElement('div');
  document.body.append(host);
  createApp(Host).mount(host);
  $('opener').focus();
  open.value = true;
  await nextTick();
  await nextTick();
}
afterEach(() => {
  host.remove();
  close.mockClear();
});

describe('useDialog', () => {
  it('moves focus in on open and back to the opener on close', async () => {
    await mount();
    expect(document.activeElement).toBe($('a'));
    open.value = false;
    await nextTick();
    expect(document.activeElement).toBe($('opener'));
  });
  it('traps Tab at both ends', async () => {
    await mount();
    $('b').focus();
    expect(key($('b'), 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($('a'));
    expect(key($('a'), 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($('b'));
  });
  it('Escape asks to close', async () => {
    await mount();
    key($('a'), 'Escape');
    expect(close).toHaveBeenCalledOnce();
  });
  it('restore() falls back when the opener is gone', async () => {
    const el = document.createElement('div');
    const panel = ref<HTMLElement | null>(el);
    const fb = document.createElement('button');
    document.body.append(fb);
    const d = useDialog(panel, { close, fallback: () => fb });
    d.restore();
    expect(document.activeElement).toBe(fb);
    fb.remove();
  });
});
