import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import ShortcutsDialog from './ShortcutsDialog.vue';
import { SHORTCUTS } from '../composables/useShortcuts.js';

describe('ShortcutsDialog', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    document.body.innerHTML = '';
  });

  it('lists every shortcut with its key and emits close', async () => {
    let closed = 0;
    app = createApp(ShortcutsDialog, { open: true, onClose: () => closed++ });
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const keys = [...dialog.querySelectorAll('kbd')].map((k) => k.textContent);
    for (const s of SHORTCUTS) {
      expect(dialog.textContent).toContain(s.label);
      expect(keys).toContain(s.key);
    }
    [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close')!.click();
    await nextTick();
    expect(closed).toBe(1);
  });
});
