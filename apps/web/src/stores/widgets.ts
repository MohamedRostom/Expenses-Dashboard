import { defineStore } from 'pinia';
import type {
  TemperatureUnitT,
  WidgetCreateT,
  WidgetPatchT,
  WidgetT,
  WidgetTypeT,
} from '@desk/contracts';
import { WIDGET_LIMIT } from '@desk/core';
import {
  createWidget,
  deleteWidget,
  getWidgets,
  getWidgetTypes,
  patchWidget,
  postWidgetsRefresh,
  putWidgetsOrder,
} from '../api/widgets.js';
import { ApiError, apiFetch } from '../api/client.js';
import { toPanelErrorKind, type PanelErrorKind } from '../utils/errors.js';

const POLL_MS = 5 * 60 * 1000;
/** research R7: a reading older than an hour is past its window. */
const WINDOW_MS = 60 * 60 * 1000;

/** Polling state per store instance, counted by owner: a remounted strip calls start() before the
 * old one's stop(), so only the last stop() may tear the timer down. */
interface Poll {
  handle: ReturnType<typeof setTimeout> | null;
  onVisibility: (() => void) | null;
  users: number;
}
const polls = new WeakMap<object, Poll>();

export const useWidgetsStore = defineStore('widgets', {
  state: () => ({
    widgets: [] as WidgetT[],
    limit: WIDGET_LIMIT,
    temperatureUnit: 'C' as TemperatureUnitT,
    loading: false,
    error: null as PanelErrorKind | null,
    /** The last fetch died before reaching the server (a TypeError from fetch). */
    networkFailed: false,
  }),

  actions: {
    /** Decided on the device, never inferred from a server error. A method, not a getter:
     * navigator.onLine is not reactive, so a cached getter would go stale. */
    isOffline(): boolean {
      return (typeof navigator !== 'undefined' && navigator.onLine === false) || this.networkFailed;
    },

    async load() {
      this.loading = true;
      this.error = null;
      try {
        const res = await getWidgets();
        this.widgets = res.widgets;
        this.limit = res.limit;
        this.temperatureUnit = res.temperatureUnit;
        this.networkFailed = false;
      } catch (err) {
        this.networkFailed = err instanceof TypeError;
        this.error = toPanelErrorKind(err);
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async types(): Promise<WidgetTypeT[]> {
      return (await getWidgetTypes()).types;
    },

    async add(body: WidgetCreateT) {
      const { widget } = await createWidget(body);
      this.widgets.push(widget);
      return widget;
    },

    async duplicate(id: string) {
      const src = this.widgets.find((w) => w.id === id);
      if (!src) return;
      return this.add({ kind: src.kind, duplicateOf: id });
    },

    /** Optimistic: the new order shows at once; a failed save puts the old one back and rethrows. */
    async reorder(ids: string[]) {
      const previous = this.widgets;
      const byId = new Map(previous.map((w) => [w.id, w]));
      this.widgets = ids.flatMap((id) => byId.get(id) ?? []);
      try {
        this.widgets = (await putWidgetsOrder(ids)).widgets;
      } catch (err) {
        this.widgets = previous;
        throw err;
      }
    },

    async patch(id: string, body: WidgetPatchT) {
      const { widget } = await patchWidget(id, body);
      this.widgets = this.widgets.map((w) => (w.id === id ? widget : w));
      return widget;
    },

    async setTemperatureUnit(unit: TemperatureUnitT) {
      await apiFetch('/me', { method: 'PATCH', body: JSON.stringify({ temperatureUnit: unit }) });
      this.temperatureUnit = unit;
    },

    async remove(id: string) {
      await deleteWidget(id);
      this.widgets = this.widgets.filter((w) => w.id !== id);
    },

    /** POST /widgets/refresh only when a reading is stale or older than its window. */
    async refreshIfStale(now: Date) {
      const due = this.widgets.some(
        (w) => w.state === 'stale' || now.getTime() - new Date(w.asOf).getTime() > WINDOW_MS,
      );
      if (!due) return;
      try {
        await postWidgetsRefresh();
      } catch (err) {
        // 429 is not an error: the next poll shows whatever the server has.
        if (!(err instanceof ApiError && err.code === 'rate_limited')) throw err;
      }
    },

    /** Five-minute poll, paused while the tab is hidden; on return, refresh then reload. */
    start() {
      let p = polls.get(this);
      if (!p) polls.set(this, (p = { handle: null, onVisibility: null, users: 0 }));
      p.users++;
      if (p.handle) return;
      const poll = p;
      const tick = () => {
        if (document.visibilityState !== 'hidden') this.load().catch(() => {});
        poll.handle = setTimeout(tick, POLL_MS);
      };
      poll.handle = setTimeout(tick, POLL_MS);
      poll.onVisibility = () => {
        if (document.visibilityState !== 'visible') return;
        // Not silent: load() records its failure in `error` (the strip shows it) before rethrowing;
        // a failed refresh is best-effort and the load that follows shows what the server has.
        void this.refreshIfStale(new Date())
          .catch(() => {})
          .then(() => this.load())
          .catch(() => {});
      };
      document.addEventListener('visibilitychange', poll.onVisibility);
    },

    stop() {
      const p = polls.get(this);
      if (!p || p.users === 0) return;
      if (--p.users > 0) return;
      if (p.handle) clearTimeout(p.handle);
      p.handle = null;
      if (p.onVisibility) document.removeEventListener('visibilitychange', p.onVisibility);
      p.onVisibility = null;
    },
  },
});
