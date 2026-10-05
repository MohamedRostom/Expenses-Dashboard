<script setup lang="ts">
/** T027 / FR-004: the month view in the fallback identity (DESIGN.md "Fallback": the incumbent
 * Ledger Desk, refined). Static over catalogue fixtures; no store, no API. Query:
 * `?state=loading|empty|error`, `?fixture=edge`. DOM contract: tests/e2e/tests/visual.spec.ts. */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button, DataTable, ErrorState, EmptyState, Skeleton, Tabs } from '@desk/ui';
import {
  budgets,
  edge,
  expenses,
  monthBudget,
  pendingRateEntry,
  type FixtureExpense,
} from '../fixtures.js';

const route = useRoute();
const state = computed(() => String(route.query['state'] ?? 'default'));
const isEdge = computed(() => route.query['fixture'] === 'edge');

const gbpFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const usdFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD' });
const gbp = (minor: number) => gbpFmt.format(minor / 100).replace('-', '−');
const usd = (minor: number) => usdFmt.format(minor / 100);
const day = (iso: string) => `${iso.slice(8)} Sep`;

const navLinks = ['Month', 'Year', 'Categories', 'Import', 'Bin', 'Settings', 'Connectors'];

const entries = computed<FixtureExpense[]>(() => {
  if (state.value === 'empty') return [];
  return isEdge.value ? edge.busyDay : expenses;
});
const showPending = computed(() => !isEdge.value && state.value !== 'empty');

const spent = computed(() =>
  isEdge.value ? edge.largeAmount : entries.value.reduce((s, e) => s + e.amount, 0),
);
const left = computed(() => monthBudget - spent.value);
const over = computed(() => left.value < 0);
const pendingCount = computed(() => (showPending.value ? 1 : 0));
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
  <div data-mockup="month-view-fallback" class="fb">
    <header class="fb-header">
      <div class="fb-bar">
        <div class="fb-month">
          <button type="button" class="fb-icon" aria-label="Previous month">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
          <span class="fb-month-name">September 2026</span>
          <button type="button" class="fb-icon" aria-label="Next month">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
        </div>
        <div class="fb-actions">
          <a href="#" class="fb-link">Sign out</a>
          <Button>Add expense</Button>
        </div>
      </div>
      <nav class="fb-nav" aria-label="Main">
        <a
          v-for="l in navLinks"
          :key="l"
          href="#"
          :class="['fb-link', { 'fb-link--current': l === 'Month' }]"
          :aria-current="l === 'Month' ? 'page' : undefined"
          >{{ l }}</a
        >
      </nav>
    </header>

    <main class="fb-main">
      <h1 class="fb-sr">September 2026</h1>

      <section class="fb-tiles" data-mockup-panel="tiles" aria-label="Month summary">
        <div class="fb-tile fb-tile--primary" data-tile>
          <span class="fb-label">{{ over ? 'Over budget this month' : 'Left this month' }}</span>
          <Skeleton v-if="state === 'loading'" height="3rem" width="12rem" />
          <span
            v-else
            data-tile-primary="figure"
            data-testid="tile-amount"
            :class="['fb-display', { 'fb-critical': over }]"
            >{{ gbp(left) }}</span
          >
          <span class="fb-label">
            <template v-if="state === 'loading'">Budget {{ gbp(monthBudget) }}</template>
            <template v-else-if="over"
              ><span class="fb-critical">over</span> a {{ gbp(monthBudget) }} budget</template
            >
            <template v-else>of {{ gbp(monthBudget) }}, month ends 30 Sep</template>
          </span>
        </div>

        <div class="fb-tile" data-tile>
          <span class="fb-label">Spent</span>
          <Skeleton v-if="state === 'loading'" height="1.75rem" width="7rem" />
          <span v-else data-testid="tile-amount" class="fb-figure">{{ gbp(spent) }}</span>
          <span class="fb-label">
            <template v-if="state === 'loading'">Counting entries</template>
            <template v-else
              >{{ entryCount }} {{ entryCount === 1 ? 'entry' : 'entries' }}</template
            >
          </span>
        </div>

        <div class="fb-tile" data-tile>
          <span class="fb-label">Pending rates</span>
          <Skeleton v-if="state === 'loading'" height="1.75rem" width="3rem" />
          <span v-else :class="['fb-figure', { 'fb-warn': pendingCount > 0 }]">{{
            pendingCount
          }}</span>
          <span class="fb-label">
            <template v-if="state === 'error'">as of 09:07, not refreshed</template>
            <template v-else-if="pendingCount > 0">ECB rate due after 16:00</template>
            <template v-else>all amounts converted</template>
          </span>
        </div>
      </section>

      <div class="fb-columns">
        <section class="fb-panel" data-mockup-panel="entries" aria-labelledby="fb-entries-h">
          <h2 id="fb-entries-h" class="fb-title">Entries</h2>
          <div class="fb-frame">
            <div v-if="state === 'loading'" class="fb-skeleton-rows" aria-busy="true">
              <span class="fb-sr">Loading entries</span>
              <Skeleton v-for="i in 6" :key="i" height="1.25rem" />
            </div>
            <EmptyState
              v-else-if="state === 'empty'"
              title="No expenses in September"
              description="Use Add expense, or send one from your phone with the capture shortcut."
            />
            <ErrorState v-else-if="state === 'error'">
              <template #action><Button variant="secondary">Try again</Button></template>
            </ErrorState>
            <table v-else class="fb-table">
              <caption class="fb-sr">
                September 2026 entries, newest first
              </caption>
              <thead>
                <tr>
                  <th class="fb-col-date" scope="col">Date</th>
                  <th scope="col">Item</th>
                  <th class="fb-col-cat" scope="col">Category</th>
                  <th class="fb-col-amount" scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="showPending">
                  <td class="fb-col-date">{{ day(pendingRateEntry.date) }}</td>
                  <td>
                    <span class="fb-item">
                      <span>{{ pendingRateEntry.note }}</span>
                      <span class="fb-item-cat">{{ pendingRateEntry.category }}</span>
                    </span>
                  </td>
                  <td class="fb-col-cat">{{ pendingRateEntry.category }}</td>
                  <td class="fb-col-amount" data-testid="entry-amount">
                    <span class="fb-amount-stack">
                      <span>{{ usd(pendingRateEntry.amountOriginal) }}</span>
                      <span class="fb-note fb-warn">rate pending</span>
                    </span>
                  </td>
                </tr>
                <tr v-for="e in rows" :key="e.id">
                  <td class="fb-col-date">{{ day(e.date) }}</td>
                  <td>
                    <span class="fb-item">
                      <span>{{ e.note }}</span>
                      <span class="fb-item-cat">{{ e.category }}</span>
                    </span>
                  </td>
                  <td class="fb-col-cat">{{ e.category }}</td>
                  <td class="fb-col-amount" data-testid="entry-amount">{{ gbp(e.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="fb-panel" data-mockup-panel="categories" aria-labelledby="fb-cat-h">
          <h2 id="fb-cat-h" class="fb-title">Categories</h2>
          <div class="fb-frame fb-frame--pad">
            <div
              v-if="state === 'loading'"
              class="fb-skeleton-rows fb-skeleton-rows--flush"
              aria-busy="true"
            >
              <span class="fb-sr">Loading categories</span>
              <Skeleton v-for="i in 3" :key="i" height="2.25rem" />
            </div>
            <Tabs v-else v-model="catTab" :tabs="catTabs" label="Category view">
              <template #bars>
                <ul class="fb-bars">
                  <li v-for="c in categoryRows" :key="c.id" class="fb-bar-row">
                    <span class="fb-bar-line">
                      <span class="fb-bar-name" data-testid="category-name" :title="c.name">{{
                        c.name
                      }}</span>
                      <span class="fb-num"
                        >{{ gbp(c.spent)
                        }}<template v-if="c.budget != null"> / {{ gbp(c.budget) }}</template></span
                      >
                    </span>
                    <svg
                      class="fb-bar-svg"
                      viewBox="0 0 100 8"
                      preserveAspectRatio="none"
                      role="img"
                      :aria-label="`${c.name}: ${gbp(c.spent)} spent of ${c.budget != null ? gbp(c.budget) : 'no budget'}`"
                    >
                      <rect
                        x="0"
                        y="0"
                        height="8"
                        :width="pct(Math.min(c.spent, c.budget ?? c.spent))"
                        class="fb-bar-fill"
                      />
                      <rect
                        v-if="isOver(c)"
                        :x="pct(c.budget!)"
                        y="0"
                        height="8"
                        :width="pct(c.spent - c.budget!)"
                        class="fb-bar-over"
                      />
                      <line
                        v-if="c.budget != null"
                        class="fb-bar-tick"
                        :x1="pct(c.budget)"
                        :x2="pct(c.budget)"
                        y1="-2"
                        y2="8"
                        vector-effect="non-scaling-stroke"
                      />
                    </svg>
                    <span v-if="isOver(c)" class="fb-note fb-critical"
                      >{{ gbp(c.spent - c.budget!) }} over</span
                    >
                    <span v-else-if="c.budget == null" class="fb-note">no budget</span>
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
</template>

<style scoped>
.fb {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-sans);
  font-size: var(--text-md);
}
.fb-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.fb-header {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter) 0;
}
.fb-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.fb-month,
.fb-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.fb-actions {
  gap: var(--space-4);
}
.fb-month-name {
  font-size: var(--text-xl);
  font-weight: 600;
  min-width: 9ch;
  text-align: center;
}
.fb-icon {
  display: inline-grid;
  place-items: center;
  min-width: var(--target-min);
  min-height: var(--target-min);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-fg);
  cursor: pointer;
}
.fb-icon:hover {
  background: var(--color-selection);
}
.fb-nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  margin-top: var(--space-2);
}
.fb-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}
.fb-link:hover {
  color: var(--color-fg);
}
.fb-link--current {
  color: var(--color-fg);
  border-bottom-color: var(--color-accent);
}
.fb-icon:focus-visible,
.fb-link:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.fb-main {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter) var(--space-12);
}
.fb-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
.fb-tile {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-raised);
}
.fb-tile--primary {
  grid-column: 1 / -1;
}
.fb-label {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
}
.fb-display,
.fb-figure,
.fb-num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.fb-display {
  font-size: min(var(--text-display), 10.5vw);
  line-height: var(--leading-display);
  font-weight: 600;
  white-space: nowrap;
}
.fb-figure {
  font-size: min(var(--text-2xl), 4.6vw);
  font-weight: 600;
}
.fb-critical {
  color: var(--color-critical);
}
.fb-warn {
  color: var(--color-warn);
}
.fb-columns {
  display: grid;
  gap: var(--space-6);
  margin-top: var(--space-6);
}
.fb-panel {
  min-width: 0;
}
.fb-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
}
.fb-frame {
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-raised);
  overflow: hidden;
}
.fb-frame--pad {
  padding: var(--space-4);
}
.fb-skeleton-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}
.fb-skeleton-rows--flush {
  padding: 0;
}
.fb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.fb-table th {
  padding: var(--space-3) var(--space-4);
  color: var(--color-fg-muted);
  font-weight: 500;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}
.fb-table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-bg);
  vertical-align: top;
}
.fb-table th.fb-col-amount,
.fb-table td.fb-col-amount {
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.fb-col-date {
  white-space: nowrap;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.fb-col-cat {
  display: none;
}
.fb-item {
  display: flex;
  flex-direction: column;
}
.fb-item-cat,
.fb-note {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
}
.fb-note.fb-warn {
  color: var(--color-warn);
}
.fb-note.fb-critical {
  color: var(--color-critical);
}
.fb-amount-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.fb-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
  padding: var(--space-4) 0 0;
  list-style: none;
}
.fb-bar-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.fb-bar-line {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--text-sm);
}
.fb-bar-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fb-num {
  white-space: nowrap;
}
.fb-bar-svg {
  display: block;
  width: 100%;
  height: var(--space-2);
  overflow: visible;
}
.fb-bar-fill {
  fill: var(--color-accent);
}
.fb-bar-over {
  fill: var(--color-critical);
}
.fb-bar-tick {
  stroke: var(--color-fg);
  stroke-width: 2;
}

@media (min-width: 768px) {
  .fb-col-cat {
    display: table-cell;
  }
  .fb-item-cat {
    display: none;
  }
}
@media (min-width: 1024px) {
  .fb-tiles {
    grid-template-columns: repeat(4, 1fr);
  }
  .fb-tile--primary {
    grid-column: span 2;
  }
  .fb-columns {
    grid-template-columns: 2fr 1fr;
    align-items: start;
  }
}
</style>
