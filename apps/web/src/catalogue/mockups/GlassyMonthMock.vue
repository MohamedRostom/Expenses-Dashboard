<script setup lang="ts">
/** Direction round for a proposed ADR-0008 ("Glassy V2", owner reference 2026-11-14): the month
 * view with softer shapes, a bento grid under a greeting, a floating icon nav and a warm backdrop.
 * Not an accepted identity: DESIGN.md (ADR-0007) stays normative until the owner approves this.
 * Self-contained on purpose (own styles, no board.css) so no shipped screen or baseline changes.
 * Over catalogue fixtures; no store, no API. Money is integer minor units. */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Tabs } from '@desk/ui';
import { months } from '../fixtures-months.js';
import type { FixtureExpense } from '../fixtures.js';
import { canNext, canPrev, month, monthIndex, openAddExpense, shiftMonth } from './mockExpenses.js';
import { setMockTheme, type MockTheme } from './useMockTheme.js';
import { backdropStops, onColour, safeAccent } from '@desk/ui';

const route = useRoute();
const router = useRouter();

const gbpFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
/** Typographic minus, never a hyphen, on money. */
const gbp = (minor: number) => gbpFmt.format(minor / 100).replace('-', '−');
const gbp0 = (minor: number) => `£${Math.round(minor / 100).toLocaleString('en-GB')}`;
const sum = (list: FixtureExpense[]) => list.reduce((s, e) => s + e.amount, 0);

const spent = computed(() => sum(month.value.entries));
const left = computed(() => month.value.budget - spent.value);
const over = computed(() => left.value < 0);
const usedPct = computed(() => Math.min(100, (spent.value / month.value.budget) * 100));
// The mock month ends today, so the average runs over the whole month.
const daily = computed(() => Math.round(spent.value / month.value.days));
const cats = computed(() => month.value.categories.map((c) => ({ ...c, over: c.spent > c.limit })));
const overCount = computed(() => cats.value.filter((c) => c.over).length);
const catScale = computed(() => Math.max(1, ...cats.value.map((c) => Math.max(c.spent, c.limit))));
const SHOWN = 6;
const rows = computed(() =>
  [...month.value.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, SHOWN),
);
const day = (iso: string) => `${iso.slice(8)} ${month.value.abbr}`;

// Month chart: hand-written SVG, one bar per month on one shared scale (viewBox 300 x 180).
const BASE = 150;
const TALL = 120;
const BAR = 60;
const series = computed(() => {
  const data = months.map((m) => ({ m, spent: sum(m.entries) }));
  const scale = Math.max(1, ...data.map((d) => Math.max(d.spent, d.m.budget)));
  return data.map(({ m, spent: s }, i) => ({
    key: m.key,
    abbr: m.abbr,
    label: m.label,
    spent: s,
    budget: m.budget,
    over: s > m.budget,
    current: i === monthIndex.value,
    x: 30 + i * 90,
    y: BASE - (s / scale) * TALL,
    yBudget: BASE - (m.budget / scale) * TALL,
  }));
});
/** A bar with only its top corners rounded, standing on the baseline. */
const bar = (x: number, y: number, r = 8) =>
  `M${x},${BASE}V${y + r}Q${x},${y} ${x + r},${y}H${x + BAR - r}Q${x + BAR},${y} ${x + BAR},${y + r}V${BASE}Z`;
const chartSummary = computed(() =>
  series.value
    .map((s) => `${s.label}: ${gbp(s.spent)} spent of a ${gbp(s.budget)} budget`)
    .join('; '),
);
const chartTab = ref('chart');
const chartTabs = [
  { id: 'chart', label: 'Chart' },
  { id: 'table', label: 'Table' },
];

const root = ref<HTMLElement | null>(null);
const theme = ref<MockTheme>('system');
const themes: { id: MockTheme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Auto' },
];
function setTheme(next: MockTheme) {
  theme.value = next;
  if (root.value) setMockTheme(root.value, next);
}

// Free colours (owner, 2026-11-14): any colour for the accent, the backdrop and the selected nav
// item. Nothing is stored here; the real controls belong in Settings › Appearance.
const WARM = '#a8501f';
const accent = ref('');
const tint = ref(WARM);
const navColour = ref('');
// The stops are computed, so they must follow the system theme live, as the CSS does.
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const systemDark = ref(!!mq?.matches);
const onScheme = (e: MediaQueryListEvent) => (systemDark.value = e.matches);
mq?.addEventListener('change', onScheme);
onBeforeUnmount(() => mq?.removeEventListener('change', onScheme));
const dark = computed(
  () => theme.value === 'dark' || (theme.value === 'system' && systemDark.value),
);
const drawnAccent = computed(
  () => accent.value && safeAccent(accent.value, dark.value, tint.value),
);
const vars = computed(() => {
  const [s1, s2, s3, s4, base] = backdropStops(tint.value, dark.value);
  return {
    '--g-s1': s1,
    '--g-s2': s2,
    '--g-s3': s3,
    '--g-s4': s4,
    '--g-base': base,
    ...(drawnAccent.value
      ? { '--color-accent': drawnAccent.value, '--color-accent-fg': onColour(drawnAccent.value) }
      : {}),
    ...(navColour.value
      ? { '--g-nav-bg': navColour.value, '--g-nav-fg': onColour(navColour.value) }
      : {}),
  };
});
const picked = (e: Event) => (e.target as HTMLInputElement).value;
function resetColours() {
  accent.value = '';
  tint.value = WARM;
  navColour.value = '';
}

const add = () => openAddExpense(router, route.query);
const coloursOpen = ref(false);
const overBy = computed(() =>
  cats.value.filter((c) => c.over).reduce((s, c) => s + c.spent - c.limit, 0),
);
// Icons: one family, 24 px grid, 1.75 stroke.
const nav: { id: string; label: string; long?: string; to: string; icon: string }[] = [
  {
    id: 'month',
    label: 'Month',
    long: 'Monthly overview',
    to: '/__ui/mockups/glassy-month',
    icon: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3 10h18M8 3v4M16 3v4',
  },
  {
    id: 'today',
    label: 'Today',
    to: '/__ui/mockups/today',
    icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  {
    id: 'widgets',
    label: 'Widgets',
    to: '/__ui/mockups/widgets',
    icon: 'M5 3h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM16 3h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM5 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2ZM16 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z',
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/__ui/mockups/settings',
    icon: 'M4 7h8M16 7h4M4 17h4M12 17h8M14 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM10 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  },
];
</script>

<template>
  <div ref="root" class="g-root" :style="vars">
    <div class="g-backdrop" aria-hidden="true" />

    <!-- Owner layout (Figma, 2026-11-14): a sidebar on desktop. The frame has no phone size, so
         below 1024 the same nav is the floating bottom bar and the sidebar extras are hidden. -->
    <aside class="g-side g-glass-strong">
      <div class="g-brand g-side-only">
        <span class="g-word">Desk</span>
        <span class="g-label">Personal finance</span>
      </div>
      <nav class="g-nav" aria-label="Main" data-testid="g-nav">
        <a
          v-for="n in nav"
          :key="n.id"
          :href="n.to"
          class="g-nav-item"
          :aria-current="n.id === 'month' ? 'page' : undefined"
          @click.prevent="router.push(n.to)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="n.icon" /></svg>
          <span class="g-nav-label">{{ n.label }}</span>
          <span v-if="n.long" class="g-nav-long">{{ n.long }}</span>
        </a>
      </nav>
      <div class="g-side-only g-personalise">
        <span class="g-label">Personalise</span>
        <button
          type="button"
          class="g-btn"
          :aria-expanded="coloursOpen"
          @click="coloursOpen = !coloursOpen"
        >
          Colours
        </button>
      </div>
      <p class="g-side-only g-side-foot">Your money, at a glance.</p>
    </aside>

    <div class="g-page">
      <header class="g-top g-glass-strong">
        <span class="g-word">Monthly overview</span>
        <div class="g-month">
          <button
            type="button"
            class="g-icon-btn"
            data-testid="month-prev"
            aria-label="Previous month"
            :disabled="!canPrev"
            @click="shiftMonth(-1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
          </button>
          <span class="g-month-label" data-testid="month-label" aria-live="polite">{{
            month.label
          }}</span>
          <button
            type="button"
            class="g-icon-btn"
            data-testid="month-next"
            aria-label="Next month"
            :disabled="!canNext"
            @click="shiftMonth(1)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
          </button>
        </div>
        <div class="g-theme" role="radiogroup" aria-label="Theme">
          <button
            v-for="t in themes"
            :key="t.id"
            type="button"
            role="radio"
            class="g-theme-opt"
            :aria-checked="theme === t.id"
            @click="setTheme(t.id)"
          >
            {{ t.label }}
          </button>
        </div>
      </header>

      <details
        class="g-glass-strong g-colours"
        :open="coloursOpen"
        @toggle="coloursOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary>Colours</summary>
        <div class="g-colour-row">
          <label>
            Accent
            <input
              type="color"
              data-testid="g-accent"
              :value="accent || (dark ? '#2c7452' : '#0e3d2a')"
              @input="accent = picked($event)"
            />
          </label>
          <label>
            Backdrop
            <input type="color" data-testid="g-tint" :value="tint" @input="tint = picked($event)" />
          </label>
          <label>
            Selected item
            <input
              type="color"
              data-testid="g-nav-colour"
              :value="navColour || '#d9d9d9'"
              @input="navColour = picked($event)"
            />
          </label>
          <button type="button" class="g-btn" @click="resetColours">Reset</button>
        </div>
        <p v-if="drawnAccent && drawnAccent !== accent" class="g-note" role="status">
          The accent is drawn a little {{ dark ? 'lighter' : 'darker' }} than picked so bars stay
          visible on the panels.
        </p>
      </details>

      <main class="g-main">
        <div class="g-hello">
          <div>
            <h1>Good morning</h1>
            <p>Here's your spending overview for {{ month.label }}.</p>
          </div>
          <button type="button" class="g-btn primary" data-testid="add-expense" @click="add">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Add expense
          </button>
        </div>

        <div class="g-bento">
          <section class="g-glass g-hero accent" data-g-tile="left" aria-labelledby="g-left-h">
            <h2 id="g-left-h" class="g-label">
              {{ over ? 'Over budget this month' : 'Left this month' }}
            </h2>
            <span class="g-display" data-g-figure>{{ gbp(left) }}</span>
            <p class="g-note">
              <span class="g-num">{{ gbp(spent) }}</span> spent of
              <span class="g-num">{{ gbp(month.budget) }}</span>
            </p>
            <div
              class="g-meter"
              role="img"
              :aria-label="`${Math.round(usedPct)}% of the budget spent`"
            >
              <span class="g-meter-fill" :style="{ width: `${usedPct}%` }" />
            </div>
            <p class="g-note g-hero-foot">
              <span v-if="over"
                ><span class="g-num">{{ gbp(-left) }}</span> over the budget</span
              >
              <span v-else
                ><span class="g-num">{{ Math.round(usedPct) }}%</span> of budget spent</span
              >
              <span
                >Ends <span class="g-num">{{ month.days }} {{ month.abbr }}</span></span
              >
            </p>
          </section>

          <div class="g-stats">
            <section class="g-glass g-stat" data-g-tile="spent">
              <h2 class="g-label">Spent this month</h2>
              <span class="g-figure" data-g-figure>{{ gbp(spent) }}</span>
              <span class="g-note">Total expenses</span>
            </section>
            <section class="g-glass g-stat" data-g-tile="daily">
              <h2 class="g-label">Daily average</h2>
              <span class="g-figure" data-g-figure>{{ gbp(daily) }}</span>
              <span class="g-note">Over {{ month.days }} days</span>
            </section>
            <section class="g-glass g-stat" data-g-tile="entries">
              <h2 class="g-label">Entries</h2>
              <span class="g-figure" data-g-figure>{{ month.entries.length }}</span>
              <span class="g-note">Expenses logged</span>
            </section>
            <section class="g-glass g-stat" data-g-tile="over">
              <h2 class="g-label">Over budget</h2>
              <span :class="['g-figure', { 'g-critical': overCount > 0 }]" data-g-figure
                >{{ overCount }} {{ overCount === 1 ? 'category' : 'categories' }}</span
              >
              <span class="g-note">Of {{ cats.length }} categories</span>
            </section>
          </div>
        </div>

        <div class="g-lower">
          <section class="g-glass g-panel g-chart" aria-labelledby="g-chart-h">
            <h2 id="g-chart-h" class="g-label">Spend by month</h2>
            <Tabs v-model="chartTab" :tabs="chartTabs" label="Spend by month view">
              <template #chart>
                <svg
                  class="g-chart-svg"
                  viewBox="0 0 300 180"
                  role="img"
                  :aria-label="chartSummary"
                >
                  <line class="g-chart-base" x1="10" x2="290" :y1="BASE" :y2="BASE" />
                  <g v-for="s in series" :key="s.key">
                    <path :d="bar(s.x, s.yBudget)" class="g-chart-budget" />
                    <path
                      :d="bar(s.x, s.y)"
                      :class="['g-chart-bar', { current: s.current, over: s.over }]"
                    />
                    <rect
                      v-if="s.over"
                      :x="s.x"
                      :y="s.yBudget"
                      :width="BAR"
                      :height="BASE - s.yBudget"
                      :class="['g-chart-under', { current: s.current }]"
                    />
                    <text class="g-chart-val" :x="s.x + BAR / 2" :y="Math.min(s.y, s.yBudget) - 8">
                      {{ gbp0(s.spent) }}
                    </text>
                    <text class="g-chart-axis" :x="s.x + BAR / 2" y="170">{{ s.abbr }}</text>
                  </g>
                </svg>
                <p class="g-note g-legend">
                  <span class="g-legend-spent" aria-hidden="true" /> Spent
                  <span class="g-legend-tick" aria-hidden="true" /> Budget
                  <span class="g-legend-over" aria-hidden="true" /> Over budget
                </p>
              </template>
              <template #table>
                <table class="g-table" data-testid="g-chart-table">
                  <caption class="g-sr">
                    Spend and budget by month
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" class="g-label">Month</th>
                      <th scope="col" class="g-label g-right">Spent</th>
                      <th scope="col" class="g-label g-right">Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in series" :key="s.key">
                      <td>{{ s.label }}</td>
                      <td class="g-right g-num">
                        {{ gbp(s.spent) }}
                        <span v-if="s.over" class="g-critical g-word-status">over</span>
                      </td>
                      <td class="g-right g-num">{{ gbp(s.budget) }}</td>
                    </tr>
                  </tbody>
                </table>
              </template>
            </Tabs>
          </section>

          <section class="g-glass g-panel g-entries" aria-labelledby="g-entries-h">
            <div class="g-panel-head">
              <div>
                <h2 id="g-entries-h" class="g-label">Recent entries</h2>
                <span class="g-note"
                  >Showing {{ rows.length }} of {{ month.entries.length }} expenses</span
                >
              </div>
              <button type="button" class="g-btn" @click="router.push('/__ui/mockups/month-view')">
                View all entries
              </button>
            </div>
            <table class="g-table">
              <caption class="g-sr">
                {{
                  month.label
                }}
                entries, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col" class="g-label g-col-date">Date</th>
                  <th scope="col" class="g-label">Item</th>
                  <th scope="col" class="g-label g-col-cat">Category</th>
                  <th scope="col" class="g-label g-right g-col-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in rows" :key="e.id">
                  <td class="g-num g-col-date">{{ day(e.date) }}</td>
                  <td>
                    <span class="g-item">{{ e.note }}</span>
                    <span class="g-item-cat">{{ e.category }}</span>
                  </td>
                  <td class="g-col-cat">
                    <span class="g-chip">{{ e.category }}</span>
                  </td>
                  <td class="g-right g-num g-col-amount">{{ gbp(e.amount) }}</td>
                </tr>
              </tbody>
            </table>
            <div class="g-panel-head g-panel-foot">
              <span class="g-note">Amounts in GBP (£)</span>
              <button type="button" class="g-btn" @click="router.push('/__ui/mockups/settings')">
                Manage budgets
              </button>
            </div>
          </section>

          <section class="g-glass g-panel g-cats" aria-labelledby="g-cats-h">
            <h2 id="g-cats-h" class="g-label">Category budgets</h2>
            <p v-if="overCount > 0" class="g-alert" role="status" data-testid="g-over-banner">
              {{ overCount }} {{ overCount === 1 ? 'category' : 'categories' }} over budget ·
              <span class="g-num">{{ gbp(overBy) }}</span> over
            </p>
            <ul class="g-cat-list">
              <li v-for="c in cats" :key="c.category">
                <span class="g-cat-line">
                  <span>{{ c.category }}</span>
                  <span class="g-num"
                    >{{ gbp(c.spent) }} <span class="g-of">/ {{ gbp(c.limit) }}</span></span
                  >
                </span>
                <svg
                  class="g-cat-bar"
                  viewBox="0 0 100 8"
                  preserveAspectRatio="none"
                  role="img"
                  :aria-label="`${c.category}: ${gbp(c.spent)} spent of ${gbp(c.limit)}`"
                >
                  <rect class="g-cat-track" width="100" height="8" rx="4" />
                  <rect
                    :class="['g-cat-fill', { over: c.over }]"
                    :width="(c.spent / catScale) * 100"
                    height="8"
                    rx="4"
                  />
                  <line
                    class="g-chart-tick"
                    :x1="(c.limit / catScale) * 100"
                    :x2="(c.limit / catScale) * 100"
                    y1="-2"
                    y2="10"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
                <span v-if="c.over" class="g-note g-critical"
                  ><span class="g-num">{{ gbp(c.spent - c.limit) }}</span> over</span
                >
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ADR-0008 values now live in tokens.css (radii, glass, blur); only the free-colour ground stays local
   so the picker can move it. Glass alphas are fixed by contrast.test.ts, not by hand. */
.g-root {
  --g-side-w: 13rem;
  --g-radius: var(--radius-xl);
  --g-pill: var(--radius-pill);
  --g-glass: var(--color-surface-glass);
  --g-glass-strong: var(--color-surface-glass-strong);
  --g-line: var(--color-glass-line);
  --g-track: color-mix(in srgb, var(--color-fg) 12%, transparent);
  --g-quiet: color-mix(in srgb, var(--color-fg) 28%, transparent);
  /* Stops come from the picked tint, capped in glassyColours.ts so text stays AA over any colour. */
  --g-backdrop:
    radial-gradient(60% 50% at 12% 18%, var(--g-s4) 0%, transparent 70%),
    radial-gradient(50% 60% at 88% 12%, var(--g-s2) 0%, transparent 70%),
    radial-gradient(70% 60% at 72% 92%, var(--g-s1) 0%, transparent 70%),
    radial-gradient(50% 50% at 18% 88%, var(--g-s3) 0%, transparent 70%), var(--g-base);
  position: relative;
  isolation: isolate;
  min-height: 100dvh;
  color: var(--color-fg);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: 1.5;
}
.g-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--g-backdrop);
}
@media print {
  .g-backdrop {
    display: none;
  }
}
.g-root :focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.g-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Glass: panels are see-through, the nav and top bar less so because they sit over moving content. */
.g-glass,
.g-glass-strong {
  background: var(--g-glass);
  border: 1px solid var(--g-line);
  border-radius: var(--g-radius);
  box-shadow: var(--shadow-raised);
  -webkit-backdrop-filter: blur(var(--blur-surface)) saturate(150%);
  backdrop-filter: blur(var(--blur-surface)) saturate(150%);
}
.g-glass-strong {
  background: var(--g-glass-strong);
}
@supports not (backdrop-filter: blur(1px)) {
  .g-glass,
  .g-glass-strong {
    background: var(--color-surface-raised);
  }
}
:root[data-panels='solid'] .g-glass,
:root[data-panels='solid'] .g-glass-strong {
  background: var(--color-surface-raised);
  backdrop-filter: none;
}
@media (prefers-reduced-transparency: reduce) {
  .g-glass,
  .g-glass-strong {
    background: var(--color-surface-raised);
    backdrop-filter: none;
  }
}

/* Page frame: room for the bottom bar on phones, for the rail on desktop. */
.g-page {
  max-width: 1160px;
  margin-inline: auto;
  padding: var(--space-4) var(--space-4) calc(var(--space-24) + env(safe-area-inset-bottom));
}
.g-main {
  display: grid;
  gap: var(--space-6);
  margin-top: var(--space-6);
}

/* Top bar */
.g-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-5);
}
.g-word {
  font-weight: 600;
  letter-spacing: -0.01em;
}
.g-month {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.g-month-label {
  min-width: 9.5rem;
  text-align: center;
  font-weight: 600;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}
.g-icon-btn {
  display: inline-grid;
  place-items: center;
  width: var(--target-min);
  height: var(--target-min);
  padding: 0;
  border: 0;
  border-radius: var(--g-pill);
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.g-icon-btn:hover:not(:disabled) {
  background: var(--g-track);
}
.g-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.g-root svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.g-icon-btn svg,
.g-nav-item svg {
  width: var(--space-6);
  height: var(--space-6);
}
.g-theme {
  display: flex;
  padding: var(--space-1);
  border-radius: var(--g-pill);
  background: var(--g-track);
}
.g-theme-opt {
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--g-pill);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.g-theme-opt[aria-checked='true'] {
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-raised);
}

/* Greeting: sits on the backdrop itself, so it uses the full foreground colour, never muted. */
.g-hello h1 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.g-hello p {
  margin: var(--space-1) 0 0;
}

.g-hero,
.g-stat,
.g-panel {
  padding: var(--space-5);
  min-width: 0;
}
.g-hero,
.g-stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
@media (hover: hover) {
  .g-hero,
  .g-stat {
    transition: transform var(--motion-fast) var(--ease-standard);
  }
  .g-hero:hover,
  .g-stat:hover {
    transform: translateY(-2px);
  }
}
.g-label {
  margin: 0;
  color: var(--color-fg-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1rem;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.g-num,
.g-display,
.g-figure {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.g-display {
  font-size: var(--text-display-fluid);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.g-stat {
  padding: var(--space-4);
}
.g-figure {
  font-size: var(--text-lg);
  font-weight: 500;
  line-height: 1.75rem;
  overflow-wrap: anywhere;
}
.g-note {
  margin: 0;
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
}
.g-critical,
.g-note.g-critical {
  color: var(--color-critical);
}
.g-word-status {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 600;
}
.g-meter {
  height: var(--space-2);
  margin-top: var(--space-2);
  border-radius: var(--g-pill);
  background: var(--g-track);
  overflow: hidden;
}
.g-meter-fill {
  display: block;
  height: 100%;
  border-radius: var(--g-pill);
  background: var(--color-accent);
}
.g-meter-fill.over {
  background: var(--color-critical);
}
.g-btn {
  min-height: var(--target-min);
  padding: 0 var(--space-5);
  border: 1px solid var(--g-quiet);
  border-radius: var(--g-pill);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}
.g-btn:hover {
  background: var(--g-track);
}
.g-btn:active {
  transform: translateY(1px);
}
.g-btn.primary {
  border-color: transparent;
  background: var(--color-accent);
  color: var(--color-accent-fg);
}
.g-btn.primary:hover {
  background: color-mix(in srgb, var(--color-accent) 88%, var(--color-fg));
}

/* Panels */
.g-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.g-panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}
.g-chart-svg {
  display: block;
  width: 100%;
  max-height: 14rem;
}
.g-chart-base {
  stroke: var(--g-quiet);
  stroke-width: 1;
}
.g-chart-budget {
  stroke: none;
  fill: var(--g-track);
}
.g-chart-bar,
.g-chart-under {
  stroke: none;
  fill: var(--g-quiet);
}
.g-chart-bar.current,
.g-chart-under.current {
  fill: var(--color-accent);
}
.g-chart-bar.over {
  fill: var(--color-critical);
}
.g-chart-tick {
  stroke: var(--color-fg);
  stroke-width: 1.5;
}
.g-chart-val,
.g-chart-axis {
  stroke: none;
  fill: var(--color-fg);
  font-size: var(--text-xs);
  text-anchor: middle;
}
.g-chart-val {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.g-legend {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.g-legend-tick {
  width: var(--space-3);
  height: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--g-track);
}
.g-legend-over {
  width: var(--space-3);
  height: var(--space-3);
  margin-left: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-critical);
}
.g-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.g-table th {
  padding: var(--space-2) var(--space-2);
  text-align: left;
  border-bottom: 1px solid var(--g-quiet);
}
.g-table td {
  padding: var(--space-3) var(--space-2);
  border-bottom: 1px solid var(--g-track);
  overflow: hidden;
  text-overflow: ellipsis;
}
.g-table tbody tr:last-child td {
  border-bottom: 0;
}
.g-table .g-right {
  text-align: right;
}
.g-col-date {
  width: 4.25rem;
}
.g-col-amount {
  width: 5.75rem;
}
.g-col-cat {
  display: none;
  width: 9rem;
}
.g-item,
.g-item-cat {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The item wraps rather than truncating; only the secondary category line is cut. */
.g-item {
  white-space: normal;
  overflow-wrap: anywhere;
}
.g-item-cat {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
}
.g-chip {
  display: inline-block;
  max-width: 100%;
  padding: 0 var(--space-3);
  border-radius: var(--g-pill);
  background: var(--g-track);
  font-size: var(--text-sm);
  line-height: 1.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
@media (min-width: 640px) {
  .g-table .g-col-cat {
    display: table-cell;
  }
  .g-item-cat {
    display: none;
  }
}
.g-cat-list {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}
.g-cat-line {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  font-size: var(--text-sm);
}
.g-of {
  color: var(--color-fg-muted);
}
.g-cat-bar {
  display: block;
  width: 100%;
  height: var(--space-2);
  overflow: visible;
}
.g-cat-track {
  stroke: none;
  fill: var(--g-track);
}
.g-cat-fill {
  stroke: none;
  fill: var(--color-accent);
}
.g-cat-fill.over {
  fill: var(--color-critical);
}

/* Colours: a mock-up control strip; native colour inputs, nothing stored. */
.g-colours {
  margin-top: var(--space-3);
  padding: 0 var(--space-5);
}
.g-colours summary {
  display: flex;
  align-items: center;
  min-height: var(--target-min);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.g-colour-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-5);
  padding-bottom: var(--space-3);
}
.g-colour-row label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}
.g-colour-row input {
  width: var(--target-min);
  height: var(--target-min);
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.g-colours .g-note {
  padding-bottom: var(--space-3);
}

/* Layout from the owner's Figma frame: hero beside four stat tiles, then entries beside the chart
   and category budgets. One column on a phone. */
.g-bento,
.g-lower {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: minmax(0, 1fr);
}
.g-stats {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 768px) {
  .g-bento {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr);
  }
}
@media (min-width: 1024px) {
  .g-lower {
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    grid-template-areas: 'entries chart' 'entries cats';
    align-items: start;
  }
  .g-entries {
    grid-area: entries;
  }
  .g-chart {
    grid-area: chart;
  }
  .g-cats {
    grid-area: cats;
  }
}
.g-hello {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.g-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.g-btn svg {
  width: var(--space-4);
  height: var(--space-4);
}

/* The filled hero: the accent, once per screen. */
.accent {
  background: var(--color-accent);
  border-color: transparent;
  color: var(--color-accent-fg);
  backdrop-filter: none;
}
.accent .g-label,
.accent .g-note {
  color: inherit;
}
.accent .g-meter {
  background: color-mix(in srgb, var(--color-accent-fg) 25%, transparent);
}
.accent .g-meter-fill {
  background: var(--color-accent-fg);
}
.g-hero-foot {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.g-panel-foot {
  align-items: center;
  padding-top: var(--space-2);
}
.g-table tbody tr:nth-child(odd) td {
  background: color-mix(in srgb, var(--g-track) 40%, transparent);
}
.g-legend-spent {
  width: var(--space-3);
  height: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-accent);
}
.g-legend-tick {
  margin-left: var(--space-3);
}
/* Said in words and in red: colour is never the only signal. */
.g-alert {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-critical) 12%, transparent);
  color: var(--color-critical);
  font-size: var(--text-sm);
  font-weight: 600;
}

/* Navigation: a floating pill bar at the bottom below 1024 (the Figma frame has no phone size),
   the owner's sidebar from 1024. Every item keeps its text label. */
.g-side {
  position: fixed;
  z-index: 10;
  left: 50%;
  bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: calc(100% - 2 * var(--space-4));
  max-width: 24rem;
  padding: var(--space-2);
  border-radius: 32px;
  box-shadow: var(--shadow-overlay);
}
.g-side-only {
  display: none;
}
.g-nav {
  display: flex;
  gap: var(--space-1);
}
.g-nav-item {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-width: 0;
  min-height: 52px;
  border-radius: var(--g-radius);
  color: var(--color-fg-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  text-decoration: none;
  touch-action: manipulation;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.g-nav-long {
  display: none;
}
.g-nav-item:hover {
  color: var(--color-fg);
  background: var(--g-track);
}
.g-nav-item[aria-current='page'] {
  color: var(--g-nav-fg, var(--color-fg));
  background: var(--g-nav-bg, var(--g-track));
}
@media (min-width: 1024px) {
  .g-side {
    left: var(--space-4);
    top: var(--space-4);
    bottom: var(--space-4);
    transform: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    width: var(--g-side-w);
    padding: var(--space-5) var(--space-3);
    border-radius: var(--g-radius);
    overflow-y: auto;
  }
  .g-side-only {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .g-brand {
    padding-inline: var(--space-3);
    gap: 0;
  }
  .g-brand .g-word {
    font-size: var(--text-xl);
  }
  .g-nav {
    flex-direction: column;
  }
  .g-nav-item {
    flex: none;
    flex-direction: row;
    justify-content: flex-start;
    gap: var(--space-3);
    min-height: var(--target-min);
    padding-inline: var(--space-3);
    border-radius: 14px;
    font-size: var(--text-sm);
  }
  .g-nav-item:has(.g-nav-long) .g-nav-label {
    display: none;
  }
  .g-nav-long {
    display: inline;
  }
  .g-personalise {
    padding: var(--space-4) var(--space-3) 0;
    border-top: 1px solid var(--g-quiet);
  }
  .g-personalise .g-btn {
    justify-content: center;
  }
  .g-side-foot {
    margin: auto 0 0;
    padding-inline: var(--space-3);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .g-page {
    padding: var(--space-4) var(--space-8) var(--space-12) calc(var(--g-side-w) + var(--space-12));
  }
}
</style>
