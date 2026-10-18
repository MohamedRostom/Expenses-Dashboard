import { createPinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoriesView from './CategoriesView.vue';

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
