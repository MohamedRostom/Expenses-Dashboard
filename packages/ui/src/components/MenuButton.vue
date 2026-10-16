<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    items: { id: string; label: string }[];
    /** Accessible name; also the visible text for the `label` variant. */
    label: string;
    variant?: 'icon' | 'label';
  }>(),
  { variant: 'icon' },
);
const emit = defineEmits<{ select: [id: string] }>();

const menuId = useId();
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const itemEls = ref<HTMLElement[]>([]);
const open = ref(false);

async function show(focusIndex: number) {
  open.value = true;
  await nextTick();
  const n = props.items.length;
  itemEls.value[(focusIndex + n) % n]?.focus();
}
function close(refocus: boolean) {
  open.value = false;
  if (refocus) void nextTick(() => trigger.value?.focus());
}
function onTriggerKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') void show(0);
  else if (e.key === 'ArrowUp') void show(-1);
  else return;
  e.preventDefault();
}
function onItemKey(e: KeyboardEvent, i: number) {
  if (e.key === 'ArrowDown') void show(i + 1);
  else if (e.key === 'ArrowUp') void show(i - 1);
  else if (e.key === 'Home') void show(0);
  else if (e.key === 'End') void show(-1);
  else if (e.key === 'Escape') close(true);
  else if (e.key === 'Tab') close(false);
  else return;
  e.preventDefault();
}
function pick(id: string) {
  emit('select', id);
  close(true);
}
function onOutside(e: Event) {
  if (open.value && !root.value?.contains(e.target as Node)) close(false);
}
onMounted(() => document.addEventListener('pointerdown', onOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));
</script>

<template>
  <div ref="root" class="desk-menu">
    <button
      ref="trigger"
      type="button"
      class="desk-menu-trigger"
      :class="variant"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      :aria-label="variant === 'icon' ? label : undefined"
      @click="open ? close(false) : show(0)"
      @keydown="onTriggerKey"
    >
      <slot name="trigger"
        ><span v-if="variant === 'icon'" aria-hidden="true">...</span
        ><template v-else>{{ label }}</template></slot
      >
    </button>
    <ul v-if="open" :id="menuId" role="menu" class="desk-menu-list" :aria-label="label">
      <li v-for="(item, i) in items" :key="item.id" role="none">
        <button
          :ref="(el) => (itemEls[i] = el as HTMLElement)"
          type="button"
          role="menuitem"
          class="desk-menu-item"
          tabindex="-1"
          @click="pick(item.id)"
          @keydown="onItemKey($event, i)"
        >
          {{ item.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.desk-menu {
  position: relative;
  display: inline-block;
}
.desk-menu-trigger {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  padding: var(--space-1) var(--space-2);
  color: var(--color-fg);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  min-width: var(--space-8);
  min-height: var(--space-8);
}
.desk-menu-trigger:hover,
.desk-menu-trigger[aria-expanded='true'] {
  background: var(--color-surface);
  border-color: var(--color-border);
}
.desk-menu-trigger:focus-visible,
.desk-menu-item:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-menu-list {
  position: absolute;
  inset-inline-end: 0;
  margin: var(--space-1) 0 0;
  padding: var(--space-1);
  list-style: none;
  min-width: 100%;
  z-index: 10;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-overlay);
}
.desk-menu-item {
  display: block;
  width: 100%;
  text-align: start;
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  padding: var(--space-2) var(--space-3);
  color: var(--color-fg);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.desk-menu-item:hover {
  background: var(--color-selection);
}
@media (max-width: 767px) {
  .desk-menu-trigger,
  .desk-menu-item {
    min-height: var(--target-min);
    min-width: var(--target-min);
  }
}
</style>
