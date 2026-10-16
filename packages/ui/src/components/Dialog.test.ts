// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import Dialog from './Dialog.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const open = ref(false);
  const closed = { n: 0 };
  createApp(
    defineComponent(
      () => () =>
        h('div', [
          h('button', { id: 'opener' }, 'open'),
          h(Dialog, { open: open.value, title: 'T', onClose: () => closed.n++, ...props }, () => [
            h('input', { id: 'first' }),
            h('button', { id: 'last' }, 'ok'),
          ]),
        ]),
    ),
  ).mount(host);
  return { open, closed };
}
const dlg = () => document.querySelector<HTMLElement>('.desk-dialog');
const key = (k: string, shiftKey = false) =>
  new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });

describe('Dialog', () => {
  it('is a modal dialog', async () => {
    const { open } = mount();
    open.value = true;
    await nextTick();
    expect(dlg()?.getAttribute('role')).toBe('dialog');
    expect(dlg()?.getAttribute('aria-modal')).toBe('true');
  });

  it('traps Tab inside', async () => {
    const { open } = mount();
    open.value = true;
    await nextTick();
    await nextTick();
    const last = document.getElementById('last')!;
    const first = document.getElementById('first')!;
    last.focus();
    const ev = key('Tab');
    last.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(key('Tab', true));
    expect(document.activeElement).toBe(last);
  });

  it('Esc closes', async () => {
    const { open, closed } = mount();
    open.value = true;
    await nextTick();
    dlg()!.dispatchEvent(key('Escape'));
    expect(closed.n).toBe(1);
  });

  it('returns focus to the opener', async () => {
    const { open } = mount();
    const opener = document.getElementById('opener')!;
    opener.focus();
    open.value = true;
    await nextTick();
    await nextTick();
    open.value = false;
    await nextTick();
    expect(document.activeElement).toBe(opener);
  });

  it.each(['center', 'bottom', 'side'])('placement %s sets its class', async (p) => {
    const { open } = mount({ placement: p });
    open.value = true;
    await nextTick();
    expect(dlg()!.classList.contains(`desk-dialog--${p}`)).toBe(true);
  });

  it('defaults to center', async () => {
    const { open } = mount();
    open.value = true;
    await nextTick();
    expect(dlg()!.classList.contains('desk-dialog--center')).toBe(true);
  });

  it("placement 'sheet' is a bottom sheet on phones and a side panel from 1024", async () => {
    const { open } = mount({ placement: 'sheet' });
    open.value = true;
    await nextTick();
    expect(dlg()!.className).toContain('desk-dialog--sheet');
    expect(document.querySelector('.desk-dialog-backdrop')!.className).toContain(
      'desk-dialog-backdrop--sheet',
    );
  });
});
