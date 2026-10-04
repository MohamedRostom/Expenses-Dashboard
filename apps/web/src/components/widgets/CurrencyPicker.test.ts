import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client.js', async (orig: () => Promise<Record<string, unknown>>) => ({
  ...(await orig()),
  apiFetch: vi.fn(),
}));

describe('CurrencyPicker errors', () => {
  it.each([
    ['unauthenticated', 401, 'Session expired'],
    ['internal', 500, 'Something went wrong'],
  ])('a failed list load (%s) shows its own copy', async (code, status, copy) => {
    const { ApiError, apiFetch } = await import('../../api/client.js');
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(code as 'internal', 'x', status));
    const pinia = createPinia();
    setActivePinia(pinia);
    const { default: CurrencyPicker } = await import('./CurrencyPicker.vue');
    const el = document.createElement('div');
    createApp(CurrencyPicker, { chosen: [] }).use(pinia).mount(el);
    for (let i = 0; i < 5; i++) await nextTick();
    expect(el.textContent).toContain(copy);
    expect(el.textContent).not.toContain("Couldn't load the currency list");
  });
});
