<script setup lang="ts">
/** T027 / FR-004: the month view in the proposed identity (DESIGN.md "Concourse Board").
 * Over catalogue fixtures; no store, no API. T027a adds the interactions: a month switcher, adding
 * and removing an expense with undo, and a rate that arrives. Query: `?state=loading|empty|error|
 * rate-arrives`, `?fixture=edge`, `?live=off`. DOM contract: tests/e2e/tests/visual.spec.ts. */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, DataTable, ErrorState, EmptyState, Skeleton, Tabs } from '@desk/ui';
import '../proposed-tokens.css';
import './board.css';
import BoardHeader from './BoardHeader.vue';
import { edge, pendingRateEntry, type FixtureExpense } from '../fixtures.js';
import { useMockLive } from './useMockLive.js';
import {
  added,
  deleted,
  month,
  monthIndex,
  openAddExpense,
  removeExpense,
  seen,
  undoRemove,
} from './mockExpenses.js';

/** `backdrop`: rendered behind the add-expense sheet, so it drops the DOM-contract attributes. */
const props = defineProps<{ backdrop?: boolean }>();
const route = useRoute();
const router = useRouter();
const state = computed(() =>
  props.backdrop ? 'default' : String(route.query['state'] ?? 'default'),
);
const isEdge = computed(() => !props.backdrop && route.query['fixture'] === 'edge');
/** Contract attribute, or nothing when this is a backdrop. */
const attr = (v: string) => (props.backdrop ? undefined : v);

const gbpFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const usdFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD' });
/** Typographic minus, never a hyphen, on money. */
const gbp = (minor: number) => gbpFmt.format(minor / 100).replace('-', '−');
const usd = (minor: number) => usdFmt.format(minor / 100);
const ABBR: Record<string, string> = { '08': 'Aug', '09': 'Sep', '10': 'Oct' };
const day = (iso: string) => `${iso.slice(8)} ${ABBR[iso.slice(5, 7)] ?? ''}`;

// The pending rate resolves 1.2 s after mount (useMockLive); `?live=off` keeps it pending.
const { rate } = useMockLive();
const arrived = rate.arrived;

const sum = (list: FixtureExpense[]) => list.reduce((s, e) => s + e.amount, 0);
const gone = (e: { id: string }) => deleted.value.includes(e.id);

const empty = computed(() => state.value === 'empty');
const baseEntries = computed<FixtureExpense[]>(() =>
  empty.value ? [] : isEdge.value ? edge.busyDay : month.value.entries,
);
const baseRemoved = computed(() => baseEntries.value.filter(gone));
const addedHere = computed(() =>
  empty.value ? [] : added.value.filter((e) => e.date.startsWith(month.value.key) && !gone(e)),
);
const entries = computed(() => [...baseEntries.value.filter((e) => !gone(e)), ...addedHere.value]);
const showPending = computed(
  () =>
    !isEdge.value &&
    !empty.value &&
    month.value.hasPendingRate &&
    !deleted.value.includes(pendingRateEntry.id),
);

const spent = computed(() => {
  const base = isEdge.value
    ? edge.largeAmount - sum(baseRemoved.value)
    : sum(baseEntries.value) - sum(baseRemoved.value);
  const settled = base + sum(addedHere.value);
  return arrived.value && showPending.value ? settled + pendingRateEntry.amountDefault : settled;
});
const monthBudget = computed(() => month.value.budget);
const left = computed(() => monthBudget.value - spent.value);
const over = computed(() => left.value < 0);
const pendingCount = computed(() => (showPending.value && !arrived.value ? 1 : 0));
const entryCount = computed(() => entries.value.length + (showPending.value ? 1 : 0));

const rows = computed(() => [...entries.value].sort((a, b) => b.date.localeCompare(a.date)));

interface CatRow {
  id: string;
  name: string;
  spent: number;
  budget: number | null;
}
const categoryRows = computed<CatRow[]>(() => {
  const inCat = (list: FixtureExpense[], c: string) => sum(list.filter((e) => e.category === c));
  const list = month.value.categories.map((b) => ({
    id: b.category,
    name: b.category,
    spent: empty.value
      ? 0
      : Math.max(
          0,
          b.spent + inCat(addedHere.value, b.category) - inCat(baseRemoved.value, b.category),
        ),
    budget: b.limit as number | null,
  }));
  return isEdge.value ? [edge.longCategory, ...list] : list;
});
const isOver = (c: CatRow) => c.budget != null && c.spent > c.budget;
const overCount = computed(() => categoryRows.value.filter(isOver).length);
// The mock month ends today, so the forecast is what is spent plus any rate still pending,
// estimated at the last published rate.
const forecast = computed(() =>
  pendingCount.value > 0 ? spent.value + pendingRateEntry.amountDefault : spent.value,
);
// One budget scale for every bar on the screen (DESIGN.md §Layout).
const scale = computed(() =>
  Math.max(1, ...categoryRows.value.map((c) => Math.max(c.spent, c.budget ?? 0))),
);
const pct = (v: number) => (v / scale.value) * 100;

const catTab = ref('bars');
const catTabs = [
  { id: 'bars', label: 'Bars' },
  { id: 'table', label: 'Table' },
];

// The arrival flip (DESIGN.md §Motion): a figure that changes after first render turns over once.
// `flips` is 0 until then, so first render never flips; the keyed figures replay it per change.
const flips = ref(!props.backdrop && seen.spent !== null && seen.spent !== spent.value ? 1 : 0);
watch([spent, left, forecast], () => flips.value++);
watch(spent, (v) => !props.backdrop && (seen.spent = v), { immediate: true });
const flip = computed(() => flips.value > 0);

// Bars grow only while a month change is in flight, never on first render or a live refresh.
const growing = ref(false);
let growTimer: ReturnType<typeof setTimeout> | undefined;
watch(monthIndex, () => {
  growing.value = true;
  clearTimeout(growTimer);
  growTimer = setTimeout(() => (growing.value = false), 280);
});

// Remove with undo: the toast holds the last removal for a few seconds.
const toast = ref<{ id: string; note: string } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function remove(e: { id: string; note: string }) {
  removeExpense(e.id);
  toast.value = { id: e.id, note: e.note };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 8000);
}
function undo() {
  if (toast.value) undoRemove(toast.value.id);
  toast.value = null;
  clearTimeout(toastTimer);
}
onBeforeUnmount(() => {
  clearTimeout(growTimer);
  clearTimeout(toastTimer);
});
</script>

<template>
  <div data-identity="proposed">
    <div :data-mockup="attr('month-view')" :class="{ 'mk-growing': growing }">
      <BoardHeader current="month" show-month />
      <main class="mk-main">
        <h1 v-if="!backdrop" class="mk-sr">{{ month.label }}</h1>

        <section class="mk-tiles" :data-mockup-panel="attr('tiles')" aria-label="Month summary">
          <div
            class="mk-flap mk-lift mk-tile mk-tile--departure mk-settle"
            style="--i: 0"
            data-tile
          >
            <span class="mk-label">{{ over ? 'Over budget this month' : 'Left this month' }}</span>
            <Skeleton v-if="state === 'loading'" height="3rem" width="12rem" />
            <span v-else class="mk-cell mk-cell--seam">
              <span
                :key="left"
                :data-tile-primary="attr('figure')"
                :data-testid="attr('tile-amount')"
                :class="['mk-display', { 'mk-critical': over, 'mk-flip': flip }]"
                >{{ gbp(left) }}</span
              >
            </span>
            <span class="mk-note">
              <template v-if="state === 'loading'"
                >Budget <span class="mk-num">{{ gbp(monthBudget) }}</span></template
              >
              <template v-else-if="over"
                ><span class="mk-num">{{ gbp(-left) }}</span> over a
                <span class="mk-num">{{ gbp(monthBudget) }}</span> budget</template
              >
              <template v-else
                >of <span class="mk-num">{{ gbp(monthBudget) }}</span
                >, month ends
                <span class="mk-num">{{ month.days }} {{ month.abbr }}</span></template
              >
            </span>
          </div>

          <div class="mk-flap mk-lift mk-tile mk-settle" style="--i: 1" data-tile>
            <span class="mk-label">Spent</span>
            <Skeleton v-if="state === 'loading'" height="1.75rem" width="7rem" />
            <span v-else class="mk-cell">
              <span
                :key="spent"
                :data-testid="attr('tile-amount')"
                :class="['mk-figure', { 'mk-flip': flip }]"
                >{{ gbp(spent) }}</span
              >
            </span>
            <span class="mk-note">
              <template v-if="state === 'loading'">Counting entries</template>
              <template v-else>
                <span class="mk-num">{{ entryCount }}</span>
                {{ entryCount === 1 ? 'entry' : 'entries' }}
                <span v-if="pendingCount > 0" class="mk-warn mk-status-word"
                  ><span class="mk-num">{{ pendingCount }}</span> rate pending</span
                >
                <span v-if="overCount > 0" class="mk-critical mk-status-word"
                  ><span class="mk-num">{{ overCount }}</span>
                  {{ overCount === 1 ? 'category' : 'categories' }} over</span
                >
              </template>
            </span>
          </div>

          <div class="mk-flap mk-lift mk-tile mk-settle" style="--i: 2" data-tile>
            <span class="mk-label">Forecast</span>
            <Skeleton v-if="state === 'loading'" height="1.75rem" width="7rem" />
            <span v-else class="mk-cell">
              <span :key="forecast" :class="['mk-figure', { 'mk-flip': flip }]">{{
                gbp(forecast)
              }}</span>
            </span>
            <span class="mk-note">
              <template v-if="state === 'loading'">Working it out</template>
              <template v-else-if="state === 'error'"
                >as of <span class="mk-num">09:07</span>, not refreshed</template
              >
              <template v-else-if="pendingCount > 0"
                >at month end, with the pending rate estimated</template
              >
              <template v-else>at month end, at this month's pace</template>
            </span>
          </div>
        </section>

        <div class="mk-columns">
          <section
            class="mk-panel mk-settle"
            style="--i: 3"
            :data-mockup-panel="attr('entries')"
            aria-labelledby="mk-entries-h"
          >
            <h2 id="mk-entries-h" class="mk-title">Entries</h2>
            <div class="mk-flap mk-board-frame">
              <div v-if="state === 'loading'" class="mk-skeleton-rows" aria-busy="true">
                <span class="mk-sr">Loading entries</span>
                <Skeleton v-for="i in 6" :key="i" height="1.25rem" />
              </div>
              <EmptyState
                v-else-if="state === 'empty'"
                :title="`No expenses in ${month.label.split(' ')[0]}`"
                description="Add the first one here, or send one from your phone with the capture shortcut."
              >
                <template #action>
                  <Button variant="secondary" @click="openAddExpense(router, route.query)"
                    >Add expense</Button
                  >
                </template>
              </EmptyState>
              <ErrorState
                v-else-if="state === 'error'"
                :title="`Couldn't load ${month.label.split(' ')[0]}'s entries`"
                description="The server didn't answer. The tiles above show the figures as of 09:07."
              >
                <template #action><Button variant="secondary">Try again</Button></template>
              </ErrorState>
              <table v-else class="mk-board">
                <caption class="mk-sr">
                  {{
                    month.label
                  }}
                  entries, newest first
                </caption>
                <thead>
                  <tr>
                    <th class="mk-col-lamp" scope="col"><span class="mk-sr">Status</span></th>
                    <th class="mk-col-date mk-label" scope="col">Date</th>
                    <th class="mk-label" scope="col">Item</th>
                    <th class="mk-col-cat mk-label" scope="col">Category</th>
                    <th class="mk-col-amount mk-label" scope="col">Amount</th>
                    <th class="mk-col-act" scope="col"><span class="mk-sr">Actions</span></th>
                  </tr>
                </thead>
                <TransitionGroup tag="tbody" name="mk-list" :css="!growing">
                  <tr v-if="showPending" key="pending" :data-testid="attr('entry-row')">
                    <td class="mk-col-lamp">
                      <span v-if="!arrived" class="mk-lamp mk-lamp--warn" />
                    </td>
                    <td class="mk-col-date">{{ day(pendingRateEntry.date) }}</td>
                    <td>
                      <span class="mk-item">
                        <span class="mk-item-name">{{ pendingRateEntry.note }}</span>
                        <span class="mk-item-cat">{{ pendingRateEntry.category }}</span>
                      </span>
                    </td>
                    <td class="mk-col-cat">{{ pendingRateEntry.category }}</td>
                    <td class="mk-col-amount" :data-testid="attr('entry-amount')">
                      <span class="mk-amount-stack mk-cell">
                        <template v-if="!arrived">
                          <span :data-live="attr('rate')">{{
                            usd(pendingRateEntry.amountOriginal)
                          }}</span>
                          <span class="mk-note mk-warn">rate pending</span>
                        </template>
                        <template v-else>
                          <span :data-live="attr('rate')" class="mk-flip">{{
                            gbp(pendingRateEntry.amountDefault)
                          }}</span>
                          <span class="mk-fig-small"
                            >{{ usd(pendingRateEntry.amountOriginal) }} at
                            {{ pendingRateEntry.rate }}</span
                          >
                        </template>
                      </span>
                    </td>
                    <td class="mk-col-act">
                      <button
                        type="button"
                        class="mk-remove"
                        :data-testid="attr('entry-remove')"
                        :aria-label="`Remove ${pendingRateEntry.note}`"
                        @click="remove(pendingRateEntry)"
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="m4 4 8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  <tr v-for="e in rows" :key="e.id" :data-testid="attr('entry-row')">
                    <td class="mk-col-lamp" />
                    <td class="mk-col-date">{{ day(e.date) }}</td>
                    <td>
                      <span class="mk-item">
                        <span class="mk-item-name">{{ e.note }}</span>
                        <span class="mk-item-cat">{{ e.category }}</span>
                      </span>
                    </td>
                    <td class="mk-col-cat">{{ e.category }}</td>
                    <td class="mk-col-amount" :data-testid="attr('entry-amount')">
                      {{ gbp(e.amount) }}
                    </td>
                    <td class="mk-col-act">
                      <button
                        type="button"
                        class="mk-remove"
                        :data-testid="attr('entry-remove')"
                        :aria-label="`Remove ${e.note}`"
                        @click="remove(e)"
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="m4 4 8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                </TransitionGroup>
              </table>
            </div>
          </section>

          <section
            class="mk-panel mk-settle"
            style="--i: 4"
            :data-mockup-panel="attr('categories')"
            aria-labelledby="mk-cat-h"
          >
            <h2 id="mk-cat-h" class="mk-title">Categories</h2>
            <div class="mk-flap">
              <div v-if="state === 'loading'" class="mk-skeleton-rows" aria-busy="true">
                <span class="mk-sr">Loading categories</span>
                <Skeleton v-for="i in 3" :key="i" height="2.25rem" />
              </div>
              <Tabs v-else v-model="catTab" :tabs="catTabs" label="Category view">
                <template #bars>
                  <ul class="mk-bars">
                    <li v-for="c in categoryRows" :key="c.id" class="mk-bar-row">
                      <span :class="['mk-lamp', { 'mk-lamp--critical': isOver(c) }]" />
                      <span class="mk-bar-body">
                        <span class="mk-bar-line">
                          <span
                            class="mk-bar-name"
                            :data-testid="attr('category-name')"
                            :title="c.name"
                            >{{ c.name }}</span
                          >
                          <span class="mk-bar-figs mk-num"
                            >{{ gbp(c.spent)
                            }}<template v-if="c.budget != null">
                              / {{ gbp(c.budget) }}</template
                            ></span
                          >
                        </span>
                        <svg
                          class="mk-bar-svg"
                          viewBox="0 0 100 8"
                          preserveAspectRatio="none"
                          role="img"
                          :aria-label="`${c.name}: ${gbp(c.spent)} spent of ${c.budget != null ? gbp(c.budget) : 'no budget'}`"
                        >
                          <line
                            class="mk-bar-base"
                            x1="0"
                            x2="100"
                            y1="7.5"
                            y2="7.5"
                            vector-effect="non-scaling-stroke"
                          />
                          <rect
                            x="0"
                            y="0"
                            height="8"
                            :width="pct(Math.min(c.spent, c.budget ?? c.spent))"
                            class="mk-bar-fill"
                          />
                          <rect
                            v-if="isOver(c)"
                            :x="pct(c.budget!)"
                            y="0"
                            height="8"
                            :width="pct(c.spent - c.budget!)"
                            class="mk-bar-fill--over"
                          />
                          <line
                            v-if="c.budget != null"
                            class="mk-bar-tick"
                            :x1="pct(c.budget)"
                            :x2="pct(c.budget)"
                            y1="-2"
                            y2="8"
                            vector-effect="non-scaling-stroke"
                          />
                        </svg>
                        <span v-if="isOver(c)" class="mk-fig-small mk-critical"
                          >{{ gbp(c.spent - c.budget!) }} over</span
                        >
                        <span v-else-if="c.budget == null" class="mk-note">no budget</span>
                      </span>
                    </li>
                  </ul>
                </template>
                <template #table>
                  <DataTable
                    :categories="categoryRows"
                    :format-money="gbp"
                    caption="Spending by category"
                    sortable
                  />
                </template>
              </Tabs>
            </div>
          </section>
        </div>
      </main>
      <Transition name="mk-toast">
        <div v-if="toast && !backdrop" class="mk-toast" role="status" data-testid="toast">
          <span class="mk-lamp mk-lamp--warn" />
          <span class="mk-toast-text">Removed {{ toast.note }}</span>
          <Button variant="ghost" size="sm" data-testid="undo-remove" @click="undo">Undo</Button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.mk-skeleton-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}
/* The settle-in must not hold a transform once it has run, or the hover lift is dead. */
.mk-tile.mk-settle {
  animation-fill-mode: backwards;
}
.mk-board .mk-col-act {
  width: var(--target-min);
  padding: 0;
  text-align: center;
}
.mk-remove {
  display: inline-grid;
  place-items: center;
  width: var(--target-min);
  height: var(--target-min);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-fg-muted);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard);
}
.mk-remove:hover {
  color: var(--color-fg);
  background: color-mix(in srgb, var(--color-fg) 6%, transparent);
}
.mk-remove svg {
  width: var(--space-4);
  height: var(--space-4);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
}
@media (min-width: 1024px) {
  .mk-board .mk-col-act {
    width: var(--space-8);
  }
  .mk-remove {
    width: var(--space-8);
    height: var(--space-8);
  }
}
/* Toast: a raised flap on Overlay with a 4px leading lamp and a ghost Undo (DESIGN.md §Toast). */
.mk-toast {
  position: fixed;
  inset-inline: var(--space-4);
  bottom: var(--space-4);
  display: grid;
  grid-template-columns: var(--space-1) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  max-width: 28rem;
  background: var(--color-surface-raised);
  color: var(--color-fg);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
}
.mk-toast .mk-lamp {
  align-self: stretch;
}
.mk-toast-text {
  overflow-wrap: anywhere;
}
.mk-toast-enter-active {
  transition:
    opacity var(--motion-base) var(--ease-standard),
    transform var(--motion-base) var(--ease-standard);
}
.mk-toast-leave-active {
  transition:
    opacity var(--motion-fast) var(--ease-exit),
    transform var(--motion-fast) var(--ease-exit);
}
.mk-toast-enter-from,
.mk-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
