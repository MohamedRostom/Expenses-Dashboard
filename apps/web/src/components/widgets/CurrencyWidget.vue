<script setup lang="ts">
import type { CurrencyRowT } from '@desk/contracts';

defineProps<{ rows: CurrencyRowT[] }>();

const GLYPH = { up: '▲', down: '▼', flat: '▬' } as const;
type Change = { pct: number; direction: keyof typeof GLYPH; since?: string };
</script>

<template>
  <ul class="desk-currency-rows">
    <li v-for="r in rows" :key="r.code" class="desk-currency-row">
      <strong class="desk-currency-code">{{ r.code }}</strong>
      <span v-if="'isDefault' in r" class="desk-currency-default">your default currency</span>
      <span v-else-if="'pending' in r" class="desk-currency-date">rate not available yet</span>
      <template v-else>
        <span class="desk-currency-rate">{{ r.rate }}</span>
        <span class="desk-currency-date">{{ r.rateDate }}</span>
        <template
          v-for="[label, c] in [
            ['Day', r.prevChange],
            ['30 days', r.monthChange],
          ] as [string, Change | null][]"
          :key="label"
        >
          <span class="desk-currency-change">
            {{ label }}:
            <template v-if="r.changesPending || !c">not available yet</template>
            <template v-else>
              <span aria-hidden="true">{{ GLYPH[c.direction] }}</span>
              {{ c.direction }} {{ c.pct.toFixed(1) }}%
              <small v-if="c.since">since {{ c.since }}</small>
            </template>
          </span>
        </template>
      </template>
    </li>
  </ul>
</template>

<style scoped>
.desk-currency-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.desk-currency-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.6rem;
  font-size: 0.85rem;
}
.desk-currency-rate,
.desk-currency-date,
.desk-currency-change {
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  font-variant-numeric: tabular-nums;
}
.desk-currency-change {
  flex-basis: 100%;
}
</style>
