<script setup lang="ts">
import { ref } from 'vue';
import { ACCENT_IDS } from '@desk/contracts';
import { Button, CategoryBars, Tabs } from '@desk/ui';

// Catalogue row for the accent presets (FR-019): Button, Tabs and a budget bar per preset in
// both themes. Each wrapper carries data-accent + data-theme, which tokens.css resolves on a
// nested element. Self-contained: CatalogueView only needs to include it.
const themes = ['light', 'dark'] as const;
const tab = ref('month');
const tabs = [
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];
const categories = [{ id: 'groceries', name: 'Groceries', spent: 25000, budget: 40000 }];
</script>

<template>
  <section id="AccentPresets" data-story="AccentPresets" class="acc">
    <h2>Accent presets</h2>
    <div class="acc-cols">
      <div v-for="t in themes" :key="t" :data-theme-col="t" class="acc-col">
        <div
          v-for="id in ACCENT_IDS"
          :key="id"
          :data-accent="id"
          :data-theme="t"
          :data-accent-cell="`${id}-${t}`"
          class="acc-cell"
        >
          <p class="acc-label">{{ id }}</p>
          <Button>Add expense</Button>
          <Tabs v-model="tab" :tabs="tabs" :label="`${id} ${t} views`" />
          <CategoryBars :categories="categories" currency="GBP" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.acc-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: var(--space-3);
}
.acc-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.acc-cell {
  background: var(--color-bg);
  color: var(--color-fg);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}
.acc-label {
  margin: 0;
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
}
</style>
