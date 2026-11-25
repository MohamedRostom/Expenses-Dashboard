<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import type { CurrencyRowT } from '@desk/contracts';

const props = defineProps<{ rows: CurrencyRowT[]; defaultCode?: string | undefined }>();

// Quick conversion: N of each listed currency in the default currency (rate = default per 1 unit).
const id = useId();
const raw = ref('');
const amount = computed(() => {
  const n = Number(raw.value.replace(',', '.'));
  return raw.value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
});
const converted = (rate: number) =>
  (amount.value! * rate).toLocaleString([], { maximumFractionDigits: 2 });
const quoted = computed(() => props.rows.some((r) => 'rate' in r));

const GLYPH = { up: '▲', down: '▼', flat: '▬' } as const;
type Change = { pct: number; direction: keyof typeof GLYPH; since?: string };
</script>

<template>
  <div v-if="defaultCode && quoted" class="desk-currency-convert">
    <label :for="id">Amount</label>
    <input :id="id" v-model="raw" type="text" inputmode="decimal" autocomplete="off" />
  </div>
  <ul class="desk-currency-rows">
    <li v-for="r in rows" :key="r.code" class="desk-currency-row">
      <strong class="desk-currency-code">{{ r.code }}</strong>
      <span v-if="'isDefault' in r" class="desk-currency-default">your default currency</span>
      <span v-else-if="'pending' in r" class="desk-currency-date">rate not available yet</span>
      <template v-else>
        <span class="desk-currency-rate">{{ r.rate }}</span>
        <span class="desk-currency-date">{{ r.rateDate }}</span>
        <span v-if="amount !== null && defaultCode" class="desk-currency-result"
          >{{ amount }} {{ r.code }} = {{ converted(r.rate) }} {{ defaultCode }}</span
        >
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
  gap: var(--space-2);
}
.desk-currency-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-currency-rate,
.desk-currency-date,
.desk-currency-change {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-currency-change {
  flex-basis: 100%;
}
.desk-currency-convert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-block-end: var(--space-2);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-currency-convert input {
  inline-size: 8rem;
  block-size: var(--target-min);
  min-block-size: 0;
  padding: 0 var(--space-3);
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-field);
  background: var(--color-surface);
  color: var(--color-fg);
  font: inherit;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-currency-result {
  flex-basis: 100%;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
</style>
