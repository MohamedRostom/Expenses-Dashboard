<script setup lang="ts">
import type { WidgetT } from '@desk/contracts';
import { useSessionStore } from '../../stores/session.js';
import { formatMoney } from '../../utils/format.js';

defineProps<{
  figures: NonNullable<Extract<WidgetT, { kind: 'fixed_costs' }>['figures']>;
}>();
const session = useSessionStore();
const money = (minor: number) => formatMoney(minor, session.user?.defaultCurrency ?? 'GBP');
</script>

<template>
  <div class="desk-fixed-costs">
    <p v-if="figures.allRecorded" class="desk-fixed-costs-num">
      All fixed costs are in · {{ money(figures.totalExpectedMinor) }} still to pay
    </p>
    <template v-else>
      <ul>
        <li v-for="r in figures.remaining" :key="r.categoryId">
          <span>{{ r.name }}</span>
          <span v-if="r.usualMinor === null || r.usualBasis === 'none'">no usual amount yet</span>
          <span v-else class="desk-fixed-costs-num">
            {{ r.usualBasis === 'previous' ? 'about ' : '' }}{{ money(r.usualMinor) }}
          </span>
        </li>
      </ul>
      <p class="desk-fixed-costs-num">Expected: {{ money(figures.totalExpectedMinor) }}</p>
    </template>
  </div>
</template>

<style scoped>
.desk-fixed-costs ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.desk-fixed-costs li {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.85rem;
}
.desk-fixed-costs p {
  margin: 0.25rem 0 0;
}
.desk-fixed-costs-num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
