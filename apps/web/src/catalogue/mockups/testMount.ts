/** Test helper for the mock-up component tests: mounts the three board routes on a memory router. */
import { createApp, h, nextTick } from 'vue';
import { RouterView, createMemoryHistory, createRouter } from 'vue-router';
import MonthViewMock from './MonthViewMock.vue';
import AddExpenseMock from './AddExpenseMock.vue';
import SettingsMock from './SettingsMock.vue';

export const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
};

export async function mountAt(url: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/__ui/mockups/month-view', component: MonthViewMock },
      { path: '/__ui/mockups/add-expense', component: AddExpenseMock },
      { path: '/__ui/mockups/settings', component: SettingsMock },
    ],
  });
  await router.push(url);
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp({ render: () => h(RouterView) });
  app.use(router);
  app.mount(el);
  await flush();
  return {
    el,
    router,
    unmount: () => {
      app.unmount();
      el.remove();
    },
  };
}

export function setValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
}

export const byLabel = (root: ParentNode, text: string) => {
  const label = [...root.querySelectorAll('label')].find((l) => l.textContent?.includes(text));
  return label?.querySelector('input, select') as HTMLInputElement | HTMLSelectElement;
};
