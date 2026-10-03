<script setup lang="ts">
import { computed } from 'vue';
import type { WidgetT } from '@desk/contracts';
import { useSessionStore } from '../../stores/session.js';
import { formatMoney } from '../../utils/format.js';

const props = defineProps<{
  figures: NonNullable<Extract<WidgetT, { kind: 'spend_pace' }>['figures']>;
}>();
const session = useSessionStore();
const money = (minor: number) => formatMoney(minor, session.user?.defaultCurrency ?? 'GBP');
const days = computed(() =>
  props.figures.daysLeft === 1 ? '1 day left' : `${props.figures.daysLeft} days left`,
);
</script>

<template>
  <div class="desk-spend-pace">
    <p class="desk-spend-pace-num" :class="{ 'desk-over': figures.overBudget }">
      {{ money(figures.spentMinor) }}
    </p>
    <template v-if="figures.budgetMinor !== null">
      <p class="desk-spend-pace-num">
        of {{ money(figures.budgetMinor) }} · {{ figures.pct }}% · {{ days }}
      </p>
      <p v-if="figures.dailyToBudgetMinor !== null" class="desk-spend-pace-num">
        {{ money(figures.dailyToBudgetMinor) }} a day to stay on budget
      </p>
    </template>
    <p v-else>
      No budget set. <RouterLink to="/categories">Set a budget in Categories</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.desk-spend-pace p {
  margin: 0.15rem 0;
}
.desk-spend-pace-num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-over {
  color: var(--color-critical);
}
</style>
