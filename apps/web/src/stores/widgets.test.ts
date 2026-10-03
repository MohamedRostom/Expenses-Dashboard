import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as WidgetsApiModule from '../api/widgets.js';
import type * as ClientModule from '../api/client.js';
import type { WidgetsResponseT, WidgetT } from '@desk/contracts';
import { ApiError } from '../api/client.js';

vi.mock('../api/widgets.js', async () => {
  const actual = await vi.importActual<typeof WidgetsApiModule>('../api/widgets.js');
  return {
    ...actual,
    getWidgets: vi.fn(),
    getWidgetTypes: vi.fn(),
    createWidget: vi.fn(),
    patchWidget: vi.fn(),
    deleteWidget: vi.fn(),
    postWidgetsRefresh: vi.fn(),
    putWidgetsOrder: vi.fn(),
  };
});

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof ClientModule>('../api/client.js');
  return { ...actual, apiFetch: vi.fn() };
});

const NOW = new Date('2026-10-03T12:00:00Z');

const widget = (over: Partial<WidgetT> = {}): WidgetT =>
  ({
    id: 'w1',
    kind: 'spend_pace',
    position: 0,
    settings: {},
    state: 'ready',
    asOf: NOW.toISOString(),
    ...over,
  }) as WidgetT;

const response = (widgets: WidgetT[]): WidgetsResponseT => ({
  widgets,
  limit: 8,
  temperatureUnit: 'C',
});

function setVisibility(value: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function setup() {
  const api = await import('../api/widgets.js');
  const { useWidgetsStore } = await import('./widgets.js');
  return { api, store: useWidgetsStore() };
}

describe('Widgets store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('load() stores widgets, limit and unit', async () => {
    const { api, store } = await setup();
    vi.mocked(api.getWidgets).mockResolvedValue(response([widget()]));
    await store.load();
    expect(store.widgets).toHaveLength(1);
    expect(store.limit).toBe(8);
    expect(store.temperatureUnit).toBe('C');
    expect(store.loading).toBe(false);
  });

  it('setTemperatureUnit sends PATCH /me and updates state', async () => {
    const { store } = await setup();
    const { apiFetch } = await import('../api/client.js');
    vi.mocked(apiFetch).mockResolvedValue({ user: {} });
    await store.setTemperatureUnit('F');
    expect(apiFetch).toHaveBeenCalledWith('/me', {
      method: 'PATCH',
      body: JSON.stringify({ temperatureUnit: 'F' }),
    });
    expect(store.temperatureUnit).toBe('F');
  });

  it('types() fetches the catalogue', async () => {
    const { api, store } = await setup();
    vi.mocked(api.getWidgetTypes).mockResolvedValue({ types: [] });
    await store.types();
    expect(api.getWidgetTypes).toHaveBeenCalledOnce();
  });

  it('add() appends, patch() replaces and remove() drops the widget', async () => {
    const { api, store } = await setup();
    store.widgets = [widget()];
    vi.mocked(api.createWidget).mockResolvedValue({ widget: widget({ id: 'w2', position: 1 }) });
    await store.add({ kind: 'spend_pace' });
    expect(store.widgets.map((w) => w.id)).toEqual(['w1', 'w2']);

    vi.mocked(api.patchWidget).mockResolvedValue({ widget: widget({ id: 'w2', state: 'stale' }) });
    await store.patch('w2', { settings: {} });
    expect(store.widgets[1]?.state).toBe('stale');

    vi.mocked(api.deleteWidget).mockResolvedValue(undefined);
    await store.remove('w1');
    expect(store.widgets.map((w) => w.id)).toEqual(['w2']);
  });

  it('reorder() sends the full id list and applies the returned order', async () => {
    const { api, store } = await setup();
    store.widgets = [widget({ id: 'a' }), widget({ id: 'b' }), widget({ id: 'c' })];
    vi.mocked(api.putWidgetsOrder).mockResolvedValue(
      response([widget({ id: 'c' }), widget({ id: 'a' }), widget({ id: 'b' })]),
    );
    await store.reorder(['c', 'a', 'b']);
    expect(api.putWidgetsOrder).toHaveBeenCalledWith(['c', 'a', 'b']);
    expect(store.widgets.map((w) => w.id)).toEqual(['c', 'a', 'b']);
  });

  it('reorder() restores the previous order and rethrows on failure', async () => {
    const { api, store } = await setup();
    store.widgets = [widget({ id: 'a' }), widget({ id: 'b' })];
    vi.mocked(api.putWidgetsOrder).mockRejectedValue(new ApiError('internal', 'x', 500));
    await expect(store.reorder(['b', 'a'])).rejects.toThrow();
    expect(store.widgets.map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('duplicate() posts kind and duplicateOf and appends', async () => {
    const { api, store } = await setup();
    store.widgets = [widget({ id: 'a', kind: 'currency' })];
    vi.mocked(api.createWidget).mockResolvedValue({
      widget: widget({ id: 'a2', kind: 'currency', position: 1 }),
    });
    await store.duplicate('a');
    expect(api.createWidget).toHaveBeenCalledWith({ kind: 'currency', duplicateOf: 'a' });
    expect(store.widgets.map((w) => w.id)).toEqual(['a', 'a2']);
  });

  it('maps a 401 to session_expired and never stores it as a widget cause', async () => {
    const { api, store } = await setup();
    store.widgets = [widget()];
    vi.mocked(api.getWidgets).mockRejectedValue(new ApiError('unauthenticated', 'x', 401));
    await expect(store.load()).rejects.toThrow();
    expect(store.error).toBe('session_expired');
    expect(store.widgets[0]?.cause).toBeUndefined();
  });

  it('derives offline from the device and network failures, never a server error', async () => {
    const { api, store } = await setup();
    vi.mocked(api.getWidgets).mockRejectedValue(new ApiError('internal', 'x', 500));
    await expect(store.load()).rejects.toThrow();
    expect(store.isOffline()).toBe(false);

    vi.mocked(api.getWidgets).mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(store.load()).rejects.toThrow();
    expect(store.isOffline()).toBe(true);

    vi.mocked(api.getWidgets).mockResolvedValue(response([]));
    await store.load();
    expect(store.isOffline()).toBe(false);

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(store.isOffline()).toBe(true);
  });

  describe('refreshIfStale()', () => {
    it('posts when a widget is in the stale state', async () => {
      const { api, store } = await setup();
      vi.mocked(api.postWidgetsRefresh).mockResolvedValue({ queued: 1 });
      store.widgets = [widget({ state: 'stale' })];
      await store.refreshIfStale(NOW);
      expect(api.postWidgetsRefresh).toHaveBeenCalledOnce();
    });

    it('posts when a reading is older than one hour', async () => {
      const { api, store } = await setup();
      vi.mocked(api.postWidgetsRefresh).mockResolvedValue({ queued: 1 });
      store.widgets = [widget({ asOf: '2026-10-03T10:59:00Z' })];
      await store.refreshIfStale(NOW);
      expect(api.postWidgetsRefresh).toHaveBeenCalledOnce();
    });

    it('does not post when every reading is inside its window', async () => {
      const { api, store } = await setup();
      store.widgets = [widget({ asOf: '2026-10-03T11:30:00Z' })];
      await store.refreshIfStale(NOW);
      expect(api.postWidgetsRefresh).not.toHaveBeenCalled();
    });

    it('does not post with no widgets', async () => {
      const { api, store } = await setup();
      await store.refreshIfStale(NOW);
      expect(api.postWidgetsRefresh).not.toHaveBeenCalled();
    });

    it('treats 429 as not an error', async () => {
      const { api, store } = await setup();
      vi.mocked(api.postWidgetsRefresh).mockRejectedValue(
        new ApiError('rate_limited', 'x', 429, { retryAfterSeconds: 30 }),
      );
      store.widgets = [widget({ state: 'stale' })];
      await store.refreshIfStale(NOW);
      expect(store.error).toBeNull();
    });
  });

  describe('polling', () => {
    it('polls GET /widgets every five minutes and stops on stop()', async () => {
      const { api, store } = await setup();
      vi.mocked(api.getWidgets).mockResolvedValue(response([]));
      store.start();
      await vi.advanceTimersByTimeAsync(299_999);
      expect(api.getWidgets).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(api.getWidgets).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(300_000);
      expect(api.getWidgets).toHaveBeenCalledTimes(2);
      store.stop();
      await vi.advanceTimersByTimeAsync(900_000);
      expect(api.getWidgets).toHaveBeenCalledTimes(2);
    });

    it('does not fire while the tab is hidden', async () => {
      const { api, store } = await setup();
      vi.mocked(api.getWidgets).mockResolvedValue(response([]));
      store.start();
      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(900_000);
      expect(api.getWidgets).not.toHaveBeenCalled();
      store.stop();
    });

    it('on becoming visible refreshes only when a reading is past its window', async () => {
      const { api, store } = await setup();
      vi.mocked(api.getWidgets).mockResolvedValue(response([]));
      vi.mocked(api.postWidgetsRefresh).mockResolvedValue({ queued: 1 });
      store.widgets = [widget({ asOf: '2026-10-03T11:30:00Z' })];
      store.start();

      setVisibility('hidden');
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
      expect(api.postWidgetsRefresh).not.toHaveBeenCalled();

      store.widgets = [widget({ state: 'stale' })];
      setVisibility('hidden');
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
      expect(api.postWidgetsRefresh).toHaveBeenCalledOnce();
      store.stop();
    });
  });

  describe('polling ownership (T071)', () => {
    const POLL = 300_000;

    it('start(); start(); stop() keeps the timer and the visibility listener alive', async () => {
      const { api, store } = await setup();
      vi.mocked(api.getWidgets).mockResolvedValue(response([]));
      vi.mocked(api.postWidgetsRefresh).mockResolvedValue({ queued: 1 });
      store.widgets = [widget({ state: 'stale' })];
      store.start();
      store.start();
      store.stop();

      await vi.advanceTimersByTimeAsync(POLL);
      expect(api.getWidgets).toHaveBeenCalledTimes(1);

      vi.mocked(api.getWidgets).mockClear();
      store.widgets = [widget({ state: 'stale' })]; // the poll's load() replaced them
      setVisibility('hidden');
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
      expect(api.postWidgetsRefresh).toHaveBeenCalledOnce();
      expect(api.getWidgets).toHaveBeenCalledOnce();

      store.stop();
      vi.mocked(api.getWidgets).mockClear();
      vi.mocked(api.postWidgetsRefresh).mockClear();
      await vi.advanceTimersByTimeAsync(POLL * 2);
      setVisibility('hidden');
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
      expect(api.getWidgets).not.toHaveBeenCalled();
      expect(api.postWidgetsRefresh).not.toHaveBeenCalled();
    });

    it('a remount (new start() before the old stop()) leaves polling running', async () => {
      const { api, store } = await setup();
      vi.mocked(api.getWidgets).mockResolvedValue(response([]));
      store.start(); // old strip
      store.start(); // new strip
      store.stop(); // old strip unmounts late
      await vi.advanceTimersByTimeAsync(POLL);
      expect(api.getWidgets).toHaveBeenCalledTimes(1);
      store.stop();
    });

    it('two pinias do not interfere', async () => {
      const { api, store: a } = await setup();
      vi.mocked(api.getWidgets).mockResolvedValue(response([]));
      setActivePinia(createPinia());
      const { useWidgetsStore } = await import('./widgets.js');
      const b = useWidgetsStore();
      a.start();
      b.start();
      a.stop();
      await vi.advanceTimersByTimeAsync(POLL);
      expect(api.getWidgets).toHaveBeenCalledTimes(1); // b's timer only
      b.stop();
      await vi.advanceTimersByTimeAsync(POLL * 2);
      expect(api.getWidgets).toHaveBeenCalledTimes(1);
    });

    it('extra stop() calls never throw or go negative', async () => {
      const { api, store } = await setup();
      vi.mocked(api.getWidgets).mockResolvedValue(response([]));
      store.stop();
      store.stop();
      store.start();
      await vi.advanceTimersByTimeAsync(POLL);
      expect(api.getWidgets).toHaveBeenCalledTimes(1);
      store.stop();
    });
  });

  it('is not imported by the month or Today stores', async () => {
    const fs = await import('node:fs');
    for (const f of ['expenses.ts', 'today.ts']) {
      expect(fs.readFileSync(`${process.cwd()}/src/stores/${f}`, 'utf8')).not.toMatch(/widgets/);
    }
  });
});
