<script setup lang="ts">
import { h, type Component, type VNode } from 'vue';
import * as ui from '@desk/ui';
import { collectStories, type Story, type StoryCase } from '@desk/ui';

// Dev-only block catalogue (research R5). Block id = story title = story file base name.
// DOM contract: tests/e2e/tests/visual.spec.ts.
const stories: Story[] = collectStories();
const themes = ['light', 'dark'] as const;

// Teleported, viewport-fixed blocks cannot sit inside a catalogue cell; they are listed instead.
const overlays = new Set(['Dialog', 'Toast']);
// Blocks whose label is slot content.
const slotLabel = new Set(['Button', 'Kbd']);

const cells = (s: Story) =>
  s.variants.flatMap((v) => s.states.map((st) => ({ v, st, key: `${v.name} / ${st.name}` })));

function render(s: Story, v: StoryCase, st: StoryCase): VNode {
  const props = { ...v.props, ...st.props };
  const slot = slotLabel.has(s.title) ? { default: () => v.name } : undefined;
  return h((ui as unknown as Record<string, Component>)[s.title]!, props, slot);
}
const Cell = (p: { s: Story; v: StoryCase; st: StoryCase }) => render(p.s, p.v, p.st);
</script>

<template>
  <main class="cat">
    <h1>UI catalogue</h1>
    <section
      v-for="s in stories"
      :id="s.title"
      :key="s.title"
      :data-story="s.title"
      class="cat-block"
    >
      <h2>{{ s.title }}</h2>
      <div class="cat-cols">
        <div v-for="t in themes" :key="t" :data-theme-col="t">
          <div :data-theme="t" class="cat-theme">
            <div v-for="c in cells(s)" :key="c.key" class="cat-cell">
              <p class="cat-label">{{ c.key }}</p>
              <p v-if="overlays.has(s.title)" class="cat-label">
                Overlay block: not rendered here.
              </p>
              <Cell v-else :s="s" :v="c.v" :st="c.st" />
            </div>
          </div>
        </div>
      </div>
    </section>
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
.cat-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
