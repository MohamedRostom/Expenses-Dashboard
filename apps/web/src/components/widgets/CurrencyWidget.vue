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
    <label :for="id">Amount to convert</label>
    <input :id="id" v-model="raw" type="text" inputmode="decimal" autocomplete="off" />
  </div>
  <ul class="desk-currency-rows">
    <li v-for="r in rows" :key="r.code" class="desk-currency-row">
      <div class="desk-currency-top">
        <strong class="desk-currency-code">{{ r.code }}</strong>
        <span v-if="'isDefault' in r" class="desk-currency-note">your default currency</span>
        <span v-else-if="'pending' in r" class="desk-currency-note">rate not available yet</span>
        <template v-else>
          <span class="desk-currency-rate">{{ r.rate }}</span>
          <span class="desk-currency-date">{{ r.rateDate }}</span>
        </template>
      </div>
      <template v-if="'rate' in r">
        <p v-if="amount !== null && defaultCode" class="desk-currency-result">
          {{ amount }} {{ r.code }} = {{ converted(r.rate) }} {{ defaultCode }}
        </p>
        <div class="desk-currency-changes">
          <template
            v-for="[label, c] in [
              ['Day', r.prevChange],
              ['30 days', r.monthChange],
            ] as [string, Change | null][]"
            :key="label"
          >
            <span
              class="desk-currency-change"
              :data-direction="r.changesPending || !c ? undefined : c.direction"
              :title="!r.changesPending && c?.since ? `since ${c.since}` : undefined"
            >
              <span class="desk-currency-change-label">{{ label }}</span>
              <template v-if="r.changesPending || !c">not available yet</template>
              <template v-else>
                <span aria-hidden="true">{{ GLYPH[c.direction] }}</span>
                {{ c.direction }} {{ c.pct.toFixed(1) }}%
                <small v-if="c.since" class="desk-currency-since">since {{ c.since }}</small>
              </template>
            </span>
          </template>
        </div>
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
/* Each currency is a quiet inset tile: code badge and headline rate, date to the right, the two
 * changes as pill chips. Direction is glyph plus word, never colour alone. */
.desk-currency-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-field);
  background: color-mix(in srgb, var(--color-fg) 5%, transparent);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-currency-top {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}
.desk-currency-code {
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-fg) 12%, transparent);
  color: var(--color-fg);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
}
.desk-currency-rate {
  font-size: var(--text-lg);
  font-weight: 600;
}
.desk-currency-date {
  margin-inline-start: auto;
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
}
.desk-currency-note {
  color: var(--color-fg-muted);
}
.desk-currency-rate,
.desk-currency-date,
.desk-currency-change,
.desk-currency-result {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.desk-currency-changes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
}
.desk-currency-change {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border: 1px solid color-mix(in srgb, var(--color-fg) 16%, transparent);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  line-height: 1.6;
  white-space: nowrap;
}
.desk-currency-change-label {
  font-family: var(--font-sans);
  color: var(--color-fg-muted);
}
/* Read aloud and in the chip's tooltip, not drawn: a third line would overflow the 12rem frame. */
.desk-currency-since {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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
  flex: 1;
  min-inline-size: 0;
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
  margin: 0;
  font-weight: 600;
}
</style>
