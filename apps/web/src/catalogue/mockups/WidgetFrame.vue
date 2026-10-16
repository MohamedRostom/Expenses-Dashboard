<script setup lang="ts">
/** One widget flap in the proposed identity (T027a, DESIGN.md §Components "compact widget variant").
 * Reusable: the widgets mock renders it five ways in a matrix and as an interactive strip; the Today
 * mock renders three. `live` (from useMockLive) is optional: given, the live figures carry
 * data-live and flip on change; absent, the frame is static. Reorder, remove and settings are
 * `controls`; the frame emits, the parent owns the order. */
import { computed, useId } from 'vue';
import { Skeleton } from '@desk/ui';
import type { useMockLive } from './useMockLive.js';
import {
  CURRENCY,
  EMPTY_COPY,
  ERROR_COPY,
  FIXED,
  PACE,
  SUNRISE,
  WEATHER,
  WIDGET_NAMES,
  money,
  pacePct,
  perDayMinor,
  staleWords,
  type WidgetKind,
  type WidgetState,
} from '../fixtures-widgets.js';
import './widgets.css';

const props = withDefaults(
  defineProps<{
    kind: WidgetKind;
    state?: WidgetState;
    live?: ReturnType<typeof useMockLive>;
    controls?: boolean;
    first?: boolean;
    last?: boolean;
    /** Settle-in step (0..5); omit for no settle-in. */
    index?: number | undefined;
    dragging?: boolean;
    over?: boolean;
    /** A static matrix cell: tagged data-sample, so only strip widgets answer to data-widget. */
    sample?: boolean;
  }>(),
  { state: 'default' },
);
const emit = defineEmits<{ earlier: []; later: []; remove: []; settings: [] }>();

const id = useId();
const name = computed(() => WIDGET_NAMES[props.kind]);
const hasContent = computed(
  () =>
    props.state === 'default' ||
    props.state === 'stale' ||
    (props.state === 'error' && ERROR_COPY[props.kind].keeps),
);

const lv = (k: 'rate' | 'weather' | 'pace') => (props.live ? k : undefined);
const rate = computed(() => (props.live?.rate.value.value ? CURRENCY.arrivedRate : CURRENCY.rate));
const rateChanged = computed(() => props.live?.rate.changed.value ?? 0);
const temp = computed(() => props.live?.weather.value.value ?? WEATHER.temps[0]);
const tempChanged = computed(() => props.live?.weather.changed.value ?? 0);
const day = computed(() => props.live?.pace.value.value ?? PACE.startDay);
const dayChanged = computed(() => props.live?.pace.changed.value ?? 0);
const perDay = computed(() => perDayMinor(day.value));
const elapsedPct = computed(() => `${(day.value / PACE.monthDays) * 100}%`);
const spentScale = computed(() => PACE.spentMinor / PACE.budgetMinor);
</script>

<template>
  <article
    class="mk-widget wg-frame mk-lift"
    :class="{
      'mk-settle': index !== undefined,
      'wg-dragging': dragging,
      'wg-over': over,
    }"
    :data-widget="sample ? undefined : kind"
    :data-sample="sample ? kind : undefined"
    :data-state="state"
    :data-flip="kind"
    :style="index !== undefined ? { '--i': Math.min(index, 5) } : undefined"
    :aria-labelledby="id"
    :aria-busy="state === 'loading' ? 'true' : undefined"
  >
    <h3 :id="id" class="mk-label wg-title">{{ name }}</h3>

    <div class="wg-body" data-widget-body :data-kind="kind">
      <div v-if="state === 'loading'" class="wg-skel" data-skeleton>
        <Skeleton height="1.75rem" width="45%" />
        <Skeleton height="1rem" />
        <Skeleton height="1rem" width="70%" />
      </div>

      <div v-else-if="state === 'empty'" class="wg-empty">
        <p class="wg-empty-title">{{ EMPTY_COPY[kind].title }}</p>
        <p class="mk-note">{{ EMPTY_COPY[kind].hint }}</p>
      </div>

      <template v-else>
        <p v-if="state === 'error'" class="wg-err">
          <span class="wg-lamp wg-lamp--crit" data-lamp aria-hidden="true"></span>
          <span class="mk-status-word">{{ ERROR_COPY[kind].text }}</span>
        </p>

        <template v-if="hasContent">
          <template v-if="kind === 'currency'">
            <div class="wg-main" :class="{ 'wg-dim': state === 'error' }">
              <p class="mk-note wg-line">{{ CURRENCY.pair }}</p>
              <p class="wg-fig">
                <span
                  :key="rateChanged"
                  class="mk-figure mk-num"
                  :class="{ 'mk-flip': rateChanged > 0 }"
                  :data-live="lv('rate')"
                  >{{ rate }}</span
                >
              </p>
              <p class="mk-note mk-widget-meta wg-line">
                Day {{ CURRENCY.day }}, 30 days {{ CURRENCY.month }}
              </p>
            </div>
          </template>

          <template v-else-if="kind === 'weather'">
            <div class="wg-main" :class="{ 'wg-dim': state === 'error' }">
              <p class="mk-note wg-line">{{ WEATHER.place }}</p>
              <p class="wg-fig">
                <span
                  :key="tempChanged"
                  class="mk-figure mk-num"
                  :class="{ 'mk-flip': tempChanged > 0 }"
                  :data-live="lv('weather')"
                  >{{ temp }}°C</span
                >
              </p>
              <p class="mk-note wg-line">
                {{ WEATHER.condition }}, H <span class="mk-num">{{ WEATHER.high }}°</span> L
                <span class="mk-num">{{ WEATHER.low }}°</span>
              </p>
            </div>
            <ul class="wg-outlook mk-note mk-num" :class="{ 'wg-dim': state === 'error' }">
              <li v-for="d in WEATHER.outlook" :key="d.day">
                <span>{{ d.day }}</span
                ><span>{{ d.max }}° / {{ d.min }}°</span>
              </li>
            </ul>
          </template>

          <template v-else-if="kind === 'sunrise'">
            <div class="wg-main" :class="{ 'wg-dim': state === 'error' }">
              <p class="mk-note wg-line">{{ SUNRISE.place }}</p>
              <p class="mk-figure mk-num wg-line">Sunrise {{ SUNRISE.sunrise }}</p>
              <p class="mk-figure mk-num wg-line">Sunset {{ SUNRISE.sunset }}</p>
            </div>
            <p class="mk-note mk-num wg-aside">Day length {{ SUNRISE.length }}</p>
          </template>

          <template v-else-if="kind === 'spend-pace'">
            <div class="wg-main" :class="{ 'wg-dim': state === 'error' }">
              <p class="wg-fig">
                <span class="mk-figure mk-num">{{ money(PACE.spentMinor) }}</span>
                <span class="mk-note mk-num">
                  of {{ money(PACE.budgetMinor) }}, {{ pacePct() }}%</span
                >
              </p>
              <div class="wg-pace" aria-hidden="true">
                <span class="wg-pace-fill" :style="{ '--spent': spentScale }"></span>
                <span
                  class="wg-pace-marker"
                  :style="{ '--pct': elapsedPct }"
                  data-pace-marker
                ></span>
              </div>
              <p class="mk-note wg-line">
                <span
                  :key="dayChanged"
                  class="mk-num"
                  :class="{ 'mk-flip': dayChanged > 0 }"
                  :data-live="lv('pace')"
                  >Day {{ day }} of {{ PACE.monthDays }}</span
                ><span v-if="perDay !== null" class="mk-widget-meta mk-num"
                  >, {{ money(perDay) }} a day to stay on budget</span
                >
              </p>
            </div>
          </template>

          <template v-else>
            <ul class="wg-fixed mk-num" :class="{ 'wg-dim': state === 'error' }">
              <li v-for="r in FIXED.remaining" :key="r.name">
                <span class="wg-fixed-name">{{ r.name }}</span>
                <span>{{ r.note ? `${r.note} ` : '' }}{{ money(r.minor) }}</span>
              </li>
              <li class="wg-fixed-total">
                <span>Expected</span><span>{{ money(FIXED.totalMinor) }}</span>
              </li>
            </ul>
          </template>

          <p v-if="state === 'stale'" class="wg-status mk-note">
            <span class="wg-lamp" data-lamp aria-hidden="true"></span>
            <span class="mk-status-word">{{ staleWords }}</span>
          </p>
          <p v-else-if="state === 'default'" class="wg-status mk-note mk-widget-meta">
            {{
              kind === 'currency'
                ? CURRENCY.meta
                : kind === 'weather'
                  ? WEATHER.meta
                  : kind === 'sunrise'
                    ? SUNRISE.meta
                    : kind === 'spend-pace'
                      ? PACE.meta
                      : FIXED.meta
            }}
          </p>
        </template>
      </template>
    </div>

    <div v-if="controls" class="wg-foot">
      <button
        type="button"
        class="wg-btn"
        :aria-label="`Move ${name} earlier`"
        :aria-disabled="first ? 'true' : undefined"
        @click="!first && emit('earlier')"
      >
        Earlier
      </button>
      <button
        type="button"
        class="wg-btn"
        :aria-label="`Move ${name} later`"
        :aria-disabled="last ? 'true' : undefined"
        @click="!last && emit('later')"
      >
        Later
      </button>
      <button
        type="button"
        class="wg-btn"
        data-testid="widget-settings"
        :aria-label="`${name} settings`"
        @click="emit('settings')"
      >
        Settings
      </button>
      <button
        type="button"
        class="wg-btn"
        data-testid="widget-remove"
        :aria-label="`Remove ${name}`"
        @click="emit('remove')"
      >
        Remove
      </button>
    </div>
  </article>
</template>
