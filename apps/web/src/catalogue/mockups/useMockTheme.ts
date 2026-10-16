/** Theme control for the mock-ups: sets data-theme on the [data-mockup-root] wrapper only
 * (light/dark), or removes it (system). Writes no storage. */
import { ref, type Ref } from 'vue';

export type MockTheme = 'light' | 'dark' | 'system';

export function setMockTheme(el: Element, mode: MockTheme) {
  if (mode === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', mode);
}

/** `from` is any element inside the wrapper (the header); the wrapper is found with closest(). */
export function useMockTheme(from: Ref<Element | null>) {
  const mode = ref<MockTheme>('system');
  function set(next: MockTheme) {
    mode.value = next;
    const wrapper = from.value?.closest('[data-mockup-root]');
    if (wrapper) setMockTheme(wrapper, next);
  }
  return { mode, set };
}
