<script setup lang="ts">
import { h, type Component, type VNode } from 'vue';
import * as ui from '@desk/ui';
import { collectStories, type Story, type StoryCase } from '@desk/ui';
import AccentPresets from './AccentPresets.vue';

// Dev-only block catalogue (research R5). Block id = story title = story file base name.
// DOM contract: tests/e2e/tests/visual.spec.ts.
const stories: Story[] = collectStories();
const themes = ['light', 'dark'] as const;

// Blocks whose label is slot content.
const slotLabel = new Set(['Button', 'Kbd']);

const cells = (s: Story) =>
  s.variants.flatMap((v) => s.states.map((st) => ({ v, st, key: `${v.name} / ${st.name}` })));

function render(s: Story, v: StoryCase, st: StoryCase): VNode {
  const props = { ...v.props, ...st.props };
  const slot = slotLabel.has(s.title) ? { default: () => v.name } : undefined;
  return h((ui as unknown as Record<string, Component>)[s.title]!, props, slot);
}
// The usage example is the plain first variant: a story's first state (often 'empty') would hide it.
const noState: StoryCase = { name: 'usage', props: {} };
const Cell = (p: { s: Story; v: StoryCase; st: StoryCase }) => render(p.s, p.v, p.st);
</script>

<template>
  <main class="cat">
    <h1>UI catalogue</h1>
    <nav id="catalogue-index" data-catalogue-index aria-label="Blocks" class="cat-index">
      <ul>
        <li v-for="s in stories" :key="s.title">
          <a :href="`#${s.title}`" data-index-link>{{ s.title }}</a>
          <span class="cat-purpose">{{ s.purpose }}</span>
        </li>
      </ul>
    </nav>
    <section
      v-for="s in stories"
      :id="s.title"
      :key="s.title"
      :data-story="s.title"
      class="cat-block"
    >
      <h2>{{ s.title }}</h2>
      <p class="cat-purpose">{{ s.purpose }} <a href="#catalogue-index">Back to index</a></p>
      <div class="cat-cols">
        <div v-for="t in themes" :key="t" :data-theme-col="t">
          <div :data-theme="t" class="cat-theme">
            <div v-for="c in cells(s)" :key="c.key" class="cat-cell">
              <p class="cat-label">{{ c.key }}</p>
              <Cell :s="s" :v="c.v" :st="c.st" />
            </div>
          </div>
        </div>
      </div>
      <div :data-usage="s.title" class="cat-usage">
        <h3>Usage</h3>
        <div class="cat-cols">
          <div v-for="t in themes" :key="t" :data-theme-col="t">
            <div :data-theme="t" class="cat-theme">
              <div data-usage-live class="cat-cell">
                <Cell :s="s" :v="s.variants[0]!" :st="noState" />
              </div>
            </div>
          </div>
        </div>
        <pre data-usage-source class="cat-source">{{ s.usage }}</pre>
      </div>
    </section>
    <AccentPresets />
  </main>
</template>

<style scoped>
.cat {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.cat-block {
  padding: var(--space-4) 0;
}
.cat-index ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-1) var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
}
.cat-purpose {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
}
.cat-source {
  margin: var(--space-3) 0 0;
  padding: var(--space-3);
  background: var(--color-surface);
  color: var(--color-fg);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  overflow-x: auto;
  white-space: pre;
}
.cat-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
/* Below 600px the two theme columns stack, so a wide block (DataTable) gets the full width
   instead of the dark column occluding the light one; wide content scrolls inside its cell.
   specs/004-web-ui-refresh/tasks.md Carry-forward, T045. */
@media (max-width: 600px) {
  .cat-cols {
    grid-template-columns: minmax(0, 1fr);
  }
}
.cat-cell {
  min-width: 0;
  overflow-x: auto;
}
/* BackgroundMotion is position: fixed; a transform makes the cell its containing block so the example
   has a box to draw (and screenshot) in. */
.cat-cell:has(.desk-motion) {
  transform: translateZ(0);
  min-block-size: 8rem;
}
.cat-theme {
  background: var(--color-bg);
  color: var(--color-fg);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.cat-label {
  margin: 0 0 var(--space-1);
  color: var(--color-fg-muted);
  font-size: var(--text-xs);
}
</style>
