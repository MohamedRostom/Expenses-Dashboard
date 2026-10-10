// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import Dialog from './Dialog.vue';
import Toast from './Toast.vue';
import DataTable from './DataTable.vue';

// T045: Dialog and Toast get an `inline` mode for the catalogue (no Teleport, no fixed position).
afterEach(() => {
  document.body.innerHTML = '';
});

async function mount(component: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp({ render: () => h(component as never, props, () => 'body') }).mount(host);
  await nextTick();
  return host;
}

describe('Dialog inline', () => {
  it('renders in place, not under body, and is not modal', async () => {
    const host = await mount(Dialog, { open: true, title: 'T', inline: true });
    const dlg = host.querySelector('[role="dialog"]')!;
    expect(dlg).not.toBeNull();
    expect(dlg.getAttribute('aria-modal')).toBe('false');
    expect(host.querySelector('.desk-dialog-backdrop--inline')).not.toBeNull();
  });
  it('is unchanged when inline is off: teleported and modal', async () => {
    const host = await mount(Dialog, { open: true, title: 'T' });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    const dlg = document.body.querySelector('[role="dialog"]')!;
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.body.querySelector('.desk-dialog-backdrop--inline')).toBeNull();
  });
  it('gives each dialog in one app its own title id', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const d = () => h(Dialog, { open: true, title: 'T', inline: true });
    createApp({ render: () => h('div', [d(), d()]) }).mount(host);
    await nextTick();
    const ids = [...host.querySelectorAll('h2')].map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('Toast inline', () => {
  const messages = [{ id: 1, text: 'Saved', variant: 'success' as const, undo: () => {} }];
  it('renders the given messages in place', async () => {
    const host = await mount(Toast, { inline: true, messages });
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Saved');
    expect(host.querySelector('.desk-toast-stack--inline')).not.toBeNull();
  });
  it('is unchanged when inline is off: teleported', async () => {
    const host = await mount(Toast, {});
    expect(host.querySelector('.desk-toast-stack')).toBeNull();
    expect(document.body.querySelector('.desk-toast-stack--inline')).toBeNull();
  });
});

describe('DataTable loading', () => {
  it('shows skeleton rows and aria-busy instead of data', async () => {
    const host = await mount(DataTable, { categories: [], loading: true, caption: 'C' });
    const table = host.querySelector('table')!;
    expect(table.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('tbody .desk-skeleton').length).toBeGreaterThan(0);
  });
  it('is not busy by default', async () => {
    const host = await mount(DataTable, { categories: [] });
    expect(host.querySelector('table')!.hasAttribute('aria-busy')).toBe(false);
  });
});
