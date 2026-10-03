import { defineStore } from 'pinia';
import type {
  TemperatureUnitT,
  WidgetCreateT,
  WidgetPatchT,
  WidgetT,
  WidgetTypeT,
} from '@desk/contracts';
import {
  createWidget,
  deleteWidget,
  getWidgets,
  getWidgetTypes,
  patchWidget,
  postWidgetsRefresh,
} from '../api/widgets.js';
import { ApiError } from '../api/client.js';
import { toPanelErrorKind, type PanelErrorKind } from '../utils/errors.js';

const POLL_MS = 5 * 60 * 1000;
/** research R7: a reading older than an hour is past its window. */
const WINDOW_MS = 60 * 60 * 1000;

let pollHandle: ReturnType<typeof setTimeout> | null = null;
let onVisibility: (() => void) | null = null;

export const useWidgetsStore = defineStore('widgets', {
  state: () => ({
    widgets: [] as WidgetT[],
    limit: 8,
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

    async patch(id: string, body: WidgetPatchT) {
      const { widget } = await patchWidget(id, body);
      this.widgets = this.widgets.map((w) => (w.id === id ? widget : w));
      return widget;
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
      this.stop();
      const tick = () => {
        if (document.visibilityState !== 'hidden') this.load().catch(() => {});
        pollHandle = setTimeout(tick, POLL_MS);
      };
      pollHandle = setTimeout(tick, POLL_MS);
      onVisibility = () => {
        if (document.visibilityState !== 'visible') return;
        void this.refreshIfStale(new Date())
          .catch(() => {})
          .then(() => this.load())
          .catch(() => {});
      };
      document.addEventListener('visibilitychange', onVisibility);
    },

    stop() {
      if (pollHandle) clearTimeout(pollHandle);
      pollHandle = null;
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
      onVisibility = null;
    },
  },
});
