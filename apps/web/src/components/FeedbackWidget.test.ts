import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it } from 'vitest';
import FeedbackWidget from './FeedbackWidget.vue';
import source from './FeedbackWidget.vue?raw';
import { useFeedback } from '../composables/useFeedback.js';

async function mountWidget() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
  await router.push('/');
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(FeedbackWidget).use(router);
  app.mount(el);
  return { el, app };
}

describe('FeedbackWidget panel', () => {
  afterEach(() => {
    useFeedback().closeFeedback();
    document.body.innerHTML = '';
  });

  it('renders nothing until openFeedback(), and has no floating toggle', async () => {
    const { el, app } = await mountWidget();
    expect(el.querySelector('.feedback-toggle')).toBeNull();
    expect(el.querySelector('#feedback-form')).toBeNull();
    useFeedback().openFeedback();
    await nextTick();
    expect(el.querySelector('form#feedback-form.feedback-form')).not.toBeNull();
    expect(el.querySelector('.feedback-toggle')).toBeNull();
    app.unmount();
  });

  it('closes with the Close feedback button and with Escape', async () => {
    const { el, app } = await mountWidget();
    useFeedback().openFeedback();
    await nextTick();
    const close = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Close feedback',
    )!;
    close.click();
    await nextTick();
    expect(el.querySelector('#feedback-form')).toBeNull();
    useFeedback().openFeedback();
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(el.querySelector('#feedback-form')).toBeNull();
    app.unmount();
  });

  it('is a fixed overlay on raised surface tokens, clear of the bottom bar below 1024px', () => {
    expect(source).toMatch(/position:\s*fixed/);
    expect(source).toMatch(/safe-area-inset-bottom/);
    expect(source).not.toMatch(/\.feedback-toggle/);
  });
});
