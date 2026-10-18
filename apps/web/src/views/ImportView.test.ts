import { createPinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImportView from './ImportView.vue';

async function mount() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ profiles: [] }), { status: 200 })),
  );
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(ImportView);
  app.use(createPinia());
  app.mount(el);
  await nextTick();
  return { el, app };
}

describe('ImportView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('step 1 sits in a panel and keeps a labelled file input', async () => {
    const { el, app } = await mount();
    expect(el.querySelector('h1')?.textContent).toBe('Import expenses');
    const region = el.querySelector('section.desk-panel-frame');
    expect(region?.querySelector('h3')?.textContent).toContain('Choose a CSV file');
    const input = el.querySelector<HTMLInputElement>('[data-testid="import-file-input"]');
    expect(input?.type).toBe('file');
    expect(input?.getAttribute('aria-label')).toBe('CSV file');
    expect(region?.contains(input!)).toBe(true);
    app.unmount();
  });

  it('shows the chosen file name and enables Next', async () => {
    const { el, app } = await mount();
    const input = el.querySelector<HTMLInputElement>('[data-testid="import-file-input"]')!;
    const file = new File(['a'], 'march.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await nextTick();
    expect(el.textContent).toContain('march.csv');
    const next = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next');
    expect(next?.disabled).toBe(false);
    app.unmount();
  });
});
