<script setup lang="ts">
/** T027: the raised-flap header shared by the proposed mock-ups (DESIGN.md §Navigation). Links go
 * to the other mock-ups where one exists; it never touches the session or the API. */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button } from '@desk/ui';
import { useMockTheme, type MockTheme } from './useMockTheme.js';

defineProps<{ current: 'month' | 'settings'; showMonth?: boolean }>();
const router = useRouter();
const root = ref<Element | null>(null);
const { mode, set } = useMockTheme(root);
const themes: { id: MockTheme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

const links = [
  { id: 'month', label: 'Month', to: '/__ui/mockups/month-view' },
  { id: 'year', label: 'Year', to: '' },
  { id: 'categories', label: 'Categories', to: '' },
  { id: 'import', label: 'Import', to: '' },
  { id: 'bin', label: 'Bin', to: '' },
  { id: 'settings', label: 'Settings', to: '/__ui/mockups/settings' },
  { id: 'connectors', label: 'Connectors', to: '' },
];
</script>

<template>
  <header ref="root" class="mk-header">
    <div class="mk-header-inner">
      <div v-if="showMonth" class="mk-switcher">
        <button type="button" class="mk-icon-btn" aria-label="Previous month, August 2026">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </button>
        <span class="mk-month">
          <span class="mk-month-long">September 2026</span>
          <span class="mk-month-short">Sep 2026</span>
        </span>
        <button type="button" class="mk-icon-btn" aria-label="Next month, October 2026">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      </div>
      <nav class="mk-nav" aria-label="Main">
        <a
          v-for="l in links"
          :key="l.id"
          :href="l.to || '#'"
          class="mk-nav-link"
          :aria-current="l.id === current ? 'page' : undefined"
          @click.prevent="l.to && router.push(l.to)"
          >{{ l.label }}</a
        >
        <button type="button" class="mk-nav-link mk-signout">Sign out</button>
      </nav>
      <div class="mk-theme" role="radiogroup" aria-label="Theme" data-testid="theme-toggle">
        <button
          v-for="t in themes"
          :key="t.id"
          type="button"
          role="radio"
          class="mk-theme-opt"
          :aria-checked="mode === t.id"
          @click="set(t.id)"
        >
          {{ t.label }}
        </button>
      </div>
      <Button class="mk-add" @click="router.push('/__ui/mockups/add-expense')">Add expense</Button>
    </div>
  </header>
</template>

<style scoped>
.mk-header {
  position: relative;
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-raised);
}
.mk-header-inner {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-2) var(--space-4);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'switch add'
    'nav nav'
    'theme theme';
  align-items: center;
  column-gap: var(--space-3);
}
.mk-switcher {
  grid-area: switch;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}
.mk-month {
  font-size: var(--text-lg);
  line-height: var(--leading-lg);
  font-weight: 600;
  white-space: nowrap;
  min-width: 0;
}
.mk-month-long {
  display: none;
}
.mk-icon-btn {
  display: inline-grid;
  place-items: center;
  width: var(--target-min);
  height: var(--target-min);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-fg);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.mk-icon-btn:hover {
  background: color-mix(in srgb, var(--color-fg) 6%, transparent);
}
.mk-icon-btn svg {
  width: var(--space-4);
  height: var(--space-4);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: square;
}
.mk-add {
  grid-area: add;
}
.mk-theme {
  grid-area: theme;
  justify-self: end;
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.mk-theme-opt {
  min-height: var(--target-min);
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  color: var(--color-fg-muted);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.mk-theme-opt:hover {
  color: var(--color-fg);
}
.mk-theme-opt[aria-checked='true'] {
  background: var(--color-accent);
  color: var(--color-accent-fg);
}
.mk-nav {
  grid-area: nav;
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-4);
  margin-top: var(--space-1);
}
.mk-nav-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--color-fg-muted);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}
.mk-nav-link:hover {
  color: var(--color-fg);
}
.mk-nav-link[aria-current='page'] {
  color: var(--color-fg);
  border-bottom-color: var(--color-accent);
}
@media (min-width: 768px) {
  .mk-header-inner {
    padding-inline: var(--space-8);
  }
  .mk-month-long {
    display: inline;
  }
  .mk-month-short {
    display: none;
  }
}
@media (min-width: 1024px) {
  .mk-header-inner {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas: 'switch nav theme add';
    column-gap: var(--space-8);
    padding-block: var(--space-1);
  }
  .mk-theme {
    justify-self: auto;
  }
  .mk-nav {
    margin-top: 0;
    column-gap: var(--space-5);
  }
  .mk-signout {
    margin-left: auto;
  }
}
</style>
