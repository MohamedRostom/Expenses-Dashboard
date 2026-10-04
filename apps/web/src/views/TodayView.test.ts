import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TodayView from './TodayView.vue';
import { useTodayStore } from '../stores/today.js';

vi.mock('../components/widgets/WidgetStrip.vue', () => ({
  __esModule: true,
  default: () => h('div', { class: 'strip' }),
}));
vi.mock('../components/today/CalendarPanel.vue', () => ({
  default: () => h('div', { class: 'cal' }),
}));
vi.mock('../components/today/InboxPanel.vue', () => ({
  default: () => h('div', { class: 'inbox' }),
}));

const flushPromises = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

function mount(load: () => Promise<void>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const today = useTodayStore();
  today.load = load;
  today.refreshIfStale = vi.fn();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(TodayView);
  app.config.errorHandler = () => {}; // load() rethrows; the rejection is expected in one test
  app.use(pinia).mount(el);
  return { el, app };
}

describe('TodayView widget strip (T063)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    document.body.innerHTML = '';
  });

  it('is absent while load is pending, then renders after the panels once load resolves', async () => {
    let resolve!: () => void;
    const m = mount(() => new Promise<void>((r) => (resolve = r)));
    app = m.app;
    await flushPromises();
    expect(m.el.querySelector('.strip')).toBeNull();
    resolve();
    await flushPromises();
    await nextTick();
    const strip = m.el.querySelector('.strip');
    expect(strip).not.toBeNull();
    const panels = m.el.querySelector('.panels')!;
    expect(panels.compareDocumentPosition(strip!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still renders after load rejects (R14)', async () => {
    const m = mount(() => Promise.reject(new Error('boom')));
    app = m.app;
    await flushPromises();
    await nextTick();
    expect(m.el.querySelector('.strip')).not.toBeNull();
  });
});
