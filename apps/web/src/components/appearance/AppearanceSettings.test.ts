import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import type { Component } from 'vue';
import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client.js', () => ({
  apiFetch: vi.fn(),
  ApiError: class extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

const newApp = (c: Component, props: Record<string, unknown>) => createApp(c, props);

const baseUser = {
  id: 'u1',
  email: 'a@example.com',
  defaultCurrency: 'GBP',
  theme: 'light' as const,
  timeZone: 'Europe/London',
  motionPreset: 'particles',
  motionColour: '#7fd1a8',
  panelsTranslucent: true,
  motionPaused: false,
};

async function setup(theme = 'light', user: Record<string, unknown> = {}) {
  const { apiFetch, ApiError } = await import('../../api/client.js');
  const { useSessionStore } = await import('../../stores/session.js');
  const { default: AppearanceSettings } = await import('./AppearanceSettings.vue');
  const pinia = createPinia();
  setActivePinia(pinia);
  const session = useSessionStore();
  session.user = { ...baseUser, ...user } as typeof session.user;
  const el = document.createElement('div');
  document.body.appendChild(el);
  newApp(AppearanceSettings, { theme }).use(pinia).mount(el);
  await nextTick();
  return { el, session, api: vi.mocked(apiFetch), ApiError };
}

const radios = (el: HTMLElement, group: string) => [
  ...el.querySelectorAll<HTMLInputElement>(
    `[role="radiogroup"][aria-label="${group}"] input[type="radio"]`,
  ),
];
const pick = (el: HTMLElement, label: string) => {
  const input = radios(el, 'Background motion').find((i) =>
    i.closest('label')?.textContent?.includes(label),
  )!;
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
const bodyOf = (api: { mock: { calls: unknown[][] } }, n: number) =>
  JSON.parse((api.mock.calls[n]![1] as { body: string }).body) as Record<string, unknown>;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

// Cold-importing the component graph takes several seconds under full parallel load and was
// being charged to the first test's 5 s timeout; warm the module cache once instead.
beforeAll(async () => {
  await import('./AppearanceSettings.vue');
  await import('../../stores/session.js');
}, 60_000);

describe('AppearanceSettings controls', () => {
  it('has a Background motion radiogroup of five presets, each with a still thumbnail', async () => {
    const { el } = await setup();
    const group = el.querySelector('[role="radiogroup"][aria-label="Background motion"]')!;
    const inputs = radios(el, 'Background motion');
    expect(inputs).toHaveLength(5);
    expect(
      inputs.map((i) =>
        i.closest('label')!.querySelector('.motion-thumb')?.getAttribute('data-preset'),
      ),
    ).toEqual(['none', 'aurora', 'grid', 'particles', 'grain']);
    expect(group.querySelectorAll('.motion-thumb[aria-hidden="true"]')).toHaveLength(5);
    const checked = inputs.filter((i) => i.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]!.closest('label')!.textContent).toContain('Particles');
    expect(group.textContent).toContain('Aurora drift');
    expect(group.textContent).toContain('Board grid');
  });

  it('shows the Motion colour group with six named round 44px buttons and a Custom input in light (T045)', async () => {
    const { el } = await setup('light');
    const g = el.querySelector('[role="radiogroup"][aria-label="Motion colour"]')!;
    const sw = [...g.querySelectorAll<HTMLButtonElement>('button[role="radio"]')];
    expect(sw).toHaveLength(6);
    expect(sw.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Signal mint',
      'Platform blue',
      'Lamp amber',
      'Dusk violet',
      'Coral',
      'Silver',
    ]);
    expect(sw.every((b) => b.title === b.getAttribute('aria-label') && b.textContent === '')).toBe(
      true,
    );
    expect(sw.filter((b) => b.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    const custom = el.querySelector('input[type="color"]')!;
    expect(custom.getAttribute('aria-label')).toBe('Custom colour');
    expect(custom.closest('label')?.textContent).toContain('Custom');
  });

  it('styles swatches as 44px circles, selected = 3px ink border plus a 2px accent ring (T045)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/appearance/AppearanceSettings.vue', 'utf8');
    expect(src).toMatch(/\.desk-appearance-swatch\s*\{[^}]*border-radius:\s*50%/);
    expect(src).toContain('3px solid var(--color-fg)');
    expect(src).toContain('0 0 0 2px var(--color-accent)');
  });

  it('preset cards stack name over hint and mark the selected one with a 2px accent border (T045)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/appearance/AppearanceSettings.vue', 'utf8');
    expect(src).toMatch(
      /\.desk-appearance-preset\[data-checked='true'\]\s*\{[^}]*border:\s*2px solid var\(--color-accent\)/,
    );
    expect(src).toMatch(/\.desk-appearance-text\s*\{[^}]*flex-direction:\s*column/);
  });

  it('picking a swatch previews and saves its colour (T045)', async () => {
    const { el, session, api } = await setup();
    api.mockResolvedValue({ user: baseUser });
    el.querySelector<HTMLButtonElement>('button[aria-label="Coral"]')!.click();
    const picked = session.user?.motionColour;
    expect(picked).not.toBe('#7fd1a8');
    await vi.advanceTimersByTimeAsync(401);
    expect(bodyOf(api, 0)).toEqual({ motionColour: picked });
  });

  it('swatches follow the radio-group keys: one tab stop, arrows move and pick', async () => {
    const { el, session } = await setup();
    const swatches = [
      ...el.querySelectorAll<HTMLButtonElement>('[aria-label="Motion colour"] button'),
    ];
    expect(swatches.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(swatches[0]!.tabIndex).toBe(0); // Signal mint, the saved colour
    swatches[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextTick();
    expect(session.user?.motionColour).toBe('#8fb3ff');
    expect(document.activeElement).toBe(swatches[1]);
    swatches[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await nextTick();
    expect(session.user?.motionColour).toBe('#e9edf2'); // wraps to Silver
  });

  it('hides the Motion colour group in dark, and for system theme when the system is dark', async () => {
    const { el } = await setup('dark');
    expect(el.querySelector('[aria-label="Motion colour"]')).toBeNull();
    document.body.innerHTML = '';
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const sys = await setup('system');
    expect(sys.el.querySelector('[aria-label="Motion colour"]')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('disables the colour group with a note while the preset is None', async () => {
    const { el } = await setup('light', { motionPreset: 'none' });
    const g = el.querySelector('[role="radiogroup"][aria-label="Motion colour"]')!;
    expect(g.getAttribute('aria-disabled')).toBe('true');
    expect(el.textContent).toContain('Applies when a motion is on');
  });

  it('has the two switches with their state', async () => {
    const { el } = await setup('light', { motionPaused: true });
    const t = el.querySelector('[role="switch"][aria-label="Translucent panels"]')!;
    const p = el.querySelector('[role="switch"][aria-label="Pause background motion"]')!;
    expect(t.getAttribute('aria-checked')).toBe('true');
    expect(p.getAttribute('aria-checked')).toBe('true');
  });

  it('every control is at least 44 px (the shared target token)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/appearance/AppearanceSettings.vue', 'utf8');
    expect(src).toContain('var(--target-min)');
    expect(src).not.toMatch(/(min-)?(height|width):\s*(1\d|2\d|3\d|4[0-3])px/);
  });
});

describe('AppearanceSettings saving', () => {
  it('previews at once and sends one PATCH with the last of five quick picks', async () => {
    const { el, session, api } = await setup();
    api.mockResolvedValue({ user: { ...baseUser, motionPreset: 'grain' } });
    for (const n of ['Aurora', 'Board grid', 'None', 'Particles', 'Grain']) pick(el, n);
    expect(session.user?.motionPreset).toBe('grain');
    await vi.advanceTimersByTimeAsync(399);
    expect(api).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0]![0]).toBe('/me');
    expect(bodyOf(api, 0)).toEqual({ motionPreset: 'grain' });
  });

  it('merges different fields into one request', async () => {
    const { el, api } = await setup();
    api.mockResolvedValue({ user: baseUser });
    pick(el, 'Board grid');
    el.querySelector<HTMLButtonElement>('[aria-label="Pause background motion"]')!.click();
    await vi.advanceTimersByTimeAsync(401);
    expect(api).toHaveBeenCalledTimes(1);
    expect(bodyOf(api, 0)).toEqual({ motionPreset: 'grid', motionPaused: true });
  });

  it('sends a change made during an in-flight save after it, and an older response does not overwrite the newer preview', async () => {
    const { el, session, api } = await setup();
    let resolveFirst!: (v: unknown) => void;
    api.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    api.mockResolvedValue({ user: { ...baseUser, motionPreset: 'aurora' } });
    pick(el, 'Grain');
    await vi.advanceTimersByTimeAsync(401);
    expect(api).toHaveBeenCalledTimes(1);
    pick(el, 'Aurora');
    await vi.advanceTimersByTimeAsync(401);
    expect(api).toHaveBeenCalledTimes(1);
    resolveFirst({ user: { ...baseUser, motionPreset: 'grain' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.user?.motionPreset).toBe('aurora');
    expect(api).toHaveBeenCalledTimes(2);
    expect(bodyOf(api, 1)).toEqual({ motionPreset: 'aurora' });
  });

  it('the custom colour previews on input and sends one request on change', async () => {
    const { el, session, api } = await setup();
    api.mockResolvedValue({ user: baseUser });
    const c = el.querySelector<HTMLInputElement>('input[type="color"]')!;
    for (const v of ['#112233', '#223344', '#334455']) {
      c.value = v;
      c.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(session.user?.motionColour).toBe('#334455');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api).not.toHaveBeenCalled();
    c.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(401);
    expect(api).toHaveBeenCalledTimes(1);
    expect(bodyOf(api, 0)).toEqual({ motionColour: '#334455' });
  });
});

describe('AppearanceSettings save errors', () => {
  it('keeps the preview, alerts by error code, and Try again resends', async () => {
    const { el, session, api, ApiError } = await setup();
    api.mockRejectedValueOnce(new ApiError('rate_limited', 'x', 429));
    api.mockResolvedValue({ user: { ...baseUser, motionPreset: 'grid' } });
    pick(el, 'Board grid');
    await vi.advanceTimersByTimeAsync(401);
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Too many');
    expect(session.user?.motionPreset).toBe('grid');
    const retry = [...alert.parentElement!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Try again',
    )!;
    retry.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(api).toHaveBeenCalledTimes(2);
    expect(bodyOf(api, 1)).toEqual({ motionPreset: 'grid' });
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('a 401 and a server error get different copy', async () => {
    const a = await setup();
    a.api.mockRejectedValueOnce(new a.ApiError('unauthenticated', 'x', 401));
    pick(a.el, 'Grain');
    await vi.advanceTimersByTimeAsync(401);
    const unauth = a.el.querySelector('[role="alert"]')!.textContent;
    document.body.innerHTML = '';
    const b = await setup();
    b.api.mockRejectedValueOnce(new b.ApiError('internal', 'x', 500));
    pick(b.el, 'Grain');
    await vi.advanceTimersByTimeAsync(401);
    const internal = b.el.querySelector('[role="alert"]')!.textContent;
    expect(unauth).toContain('Sign in');
    expect(internal).not.toBe(unauth);
  });
});
