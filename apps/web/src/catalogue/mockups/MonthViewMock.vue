<script setup lang="ts">
/** T027 / FR-004: the month view in the proposed identity (DESIGN.md "Concourse Board").
 * Static over catalogue fixtures; no store, no API. Query: `?state=loading|empty|error|rate-arrives`,
 * `?fixture=edge`. DOM contract: tests/e2e/tests/visual.spec.ts. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, DataTable, ErrorState, EmptyState, Skeleton, Tabs } from '@desk/ui';
import '../proposed-tokens.css';
import './board.css';
import BoardHeader from './BoardHeader.vue';
import {
  budgets,
  edge,
  expenses,
  monthBudget,
  pendingRateEntry,
  type FixtureExpense,
} from '../fixtures.js';

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
const day = (iso: string) => `${iso.slice(8)} Sep`;

// The arrival flip demo: the pending rate resolves 1.2 s after mount. Elements rendered after that
// carry `mk-flip`, so the turn happens once, on arrival, never on first render.
const arrived = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  if (state.value === 'rate-arrives') timer = setTimeout(() => (arrived.value = true), 1200);
});
onBeforeUnmount(() => clearTimeout(timer));

const entries = computed<FixtureExpense[]>(() => {
  if (state.value === 'empty') return [];
  return isEdge.value ? edge.busyDay : expenses;
});
const showPending = computed(() => !isEdge.value && state.value !== 'empty');

const spent = computed(() => {
  if (isEdge.value) return edge.largeAmount;
  const base = entries.value.reduce((s, e) => s + e.amount, 0);
  return arrived.value && showPending.value ? base + pendingRateEntry.amountDefault : base;
});
const left = computed(() => monthBudget - spent.value);
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
  const empty = state.value === 'empty';
  const list = budgets.map((b) => ({
    id: b.category,
    name: b.category,
    spent: empty ? 0 : b.spent,
    budget: b.limit as number | null,
  }));
  return isEdge.value ? [edge.longCategory, ...list] : list;
});
const isOver = (c: CatRow) => c.budget != null && c.spent > c.budget;
const overCount = computed(() => categoryRows.value.filter(isOver).length);
// The mock month ends today (30 Sep), so the forecast is what is spent plus any rate still pending,
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
</script>

<template>
  <div data-identity="proposed">
    <div :data-mockup="attr('month-view')">
      <BoardHeader current="month" show-month />
      <main class="mk-main">
        <h1 v-if="!backdrop" class="mk-sr">September 2026</h1>

        <section class="mk-tiles" :data-mockup-panel="attr('tiles')" aria-label="Month summary">
          <div class="mk-flap mk-tile mk-tile--departure" data-tile>
            <span class="mk-label">{{ over ? 'Over budget this month' : 'Left this month' }}</span>
            <Skeleton v-if="state === 'loading'" height="3rem" width="12rem" />
            <span v-else class="mk-cell mk-cell--seam">
              <span
                :key="left"
                :data-tile-primary="attr('figure')"
                :data-testid="attr('tile-amount')"
                :class="['mk-display', { 'mk-critical': over, 'mk-flip': arrived }]"
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
                >, month ends <span class="mk-num">30 Sep</span></template
              >
            </span>
          </div>

          <div class="mk-flap mk-tile" data-tile>
            <span class="mk-label">Spent</span>
            <Skeleton v-if="state === 'loading'" height="1.75rem" width="7rem" />
            <span v-else class="mk-cell">
              <span
                :key="spent"
                :data-testid="attr('tile-amount')"
                :class="['mk-figure', { 'mk-flip': arrived }]"
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

          <div class="mk-flap mk-tile" data-tile>
            <span class="mk-label">Forecast</span>
            <Skeleton v-if="state === 'loading'" height="1.75rem" width="7rem" />
            <span v-else class="mk-cell">
              <span :key="forecast" :class="['mk-figure', { 'mk-flip': arrived }]">{{
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
            class="mk-panel"
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
                title="No expenses in September"
                description="Add the first one here, or send one from your phone with the capture shortcut."
              >
                <template #action>
                  <Button variant="secondary" @click="router.push('/__ui/mockups/add-expense')"
                    >Add expense</Button
                  >
                </template>
              </EmptyState>
              <ErrorState
                v-else-if="state === 'error'"
                title="Couldn't load September's entries"
                description="The server didn't answer. The tiles above show the figures as of 09:07."
              >
                <template #action><Button variant="secondary">Try again</Button></template>
              </ErrorState>
              <table v-else class="mk-board">
                <caption class="mk-sr">
                  September 2026 entries, newest first
                </caption>
                <thead>
                  <tr>
                    <th class="mk-col-lamp" scope="col"><span class="mk-sr">Status</span></th>
                    <th class="mk-col-date mk-label" scope="col">Date</th>
                    <th class="mk-label" scope="col">Item</th>
                    <th class="mk-col-cat mk-label" scope="col">Category</th>
                    <th class="mk-col-amount mk-label" scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="showPending">
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
                          <span>{{ usd(pendingRateEntry.amountOriginal) }}</span>
                          <span class="mk-note mk-warn">rate pending</span>
                        </template>
                        <template v-else>
                          <span class="mk-flip">{{ gbp(pendingRateEntry.amountDefault) }}</span>
                          <span class="mk-fig-small"
                            >{{ usd(pendingRateEntry.amountOriginal) }} at
                            {{ pendingRateEntry.rate }}</span
                          >
                        </template>
                      </span>
                    </td>
                  </tr>
                  <tr v-for="e in rows" :key="e.id">
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
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section
            class="mk-panel"
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
</style>
