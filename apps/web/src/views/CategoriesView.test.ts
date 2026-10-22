import { createPinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoriesView from './CategoriesView.vue';
import { apiFetch } from '../api/client.js';

vi.mock('../api/client.js', () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async () => ({
    categories: [
      {
        id: 'c1',
        name: 'Rent',
        colour: '#112233',
        sortOrder: 1,
        archivedAt: null,
        defaultKind: null,
        budgetMinor: null,
      },
      {
        id: 'c2',
        name: 'Old',
        colour: '#445566',
        sortOrder: 2,
        archivedAt: '2026-01-01T00:00:00Z',
        defaultKind: null,
        budgetMinor: null,
      },
    ],
  })),
}));

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('CategoriesView inline edits', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    vi.mocked(apiFetch).mockClear();
  });

  async function mount() {
    app = createApp(CategoriesView);
    app.use(createPinia());
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    await flush();
    return el;
  }
  const patches = () =>
    vi
      .mocked(apiFetch)
      .mock.calls.filter(([, init]) => init?.method === 'PATCH')
      .map(([url, init]) => [url, JSON.parse(String(init!.body))]);

  it('saves the kind picked from the Kind cell', async () => {
    const el = await mount();
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="Kind for Rent"]')!;
    select.value = 'fixed';
    select.dispatchEvent(new Event('change'));
    await flush();
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await flush();
    expect(patches()).toEqual([
      ['/categories/c1', { defaultKind: 'fixed' }],
      ['/categories/c1', { defaultKind: null }],
    ]);
  });

  it('turns "No budget" into a numbers-only input and saves it on Enter', async () => {
    const el = await mount();
    el.querySelector<HTMLButtonElement>('button[aria-label="Budget for Rent"]')!.click();
    await flush();
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Budget for Rent"]')!;
    expect(document.activeElement).toBe(input);
    input.value = '1a2.5x0.7';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('12.507');
    input.value = '12.50';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(patches()).toEqual([['/categories/c1', { budgetMinor: 1250 }]]);
  });

  it.each(['', '0', '0.00'])('saves %j as no budget', async (typed) => {
    const el = await mount();
    el.querySelector<HTMLButtonElement>('button[aria-label="Budget for Rent"]')!.click();
    await flush();
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Budget for Rent"]')!;
    input.value = typed;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    // Rent has no budget yet, so nothing changes and nothing is sent.
    expect(patches()).toEqual([]);
    expect(el.querySelector('button[aria-label="Budget for Rent"]')?.textContent).toBe('No budget');
  });
});

describe('CategoriesView board look', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => app?.unmount());

  it('puts active and archived tables inside panel frames', async () => {
    app = createApp(CategoriesView);
    app.use(createPinia());
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    await flush();
    const frames = el.querySelectorAll('.desk-panel-frame');
    expect(frames).toHaveLength(2);
    for (const f of frames) expect(f.querySelector('.desk-data-table-wrap')).not.toBeNull();
  });
});
