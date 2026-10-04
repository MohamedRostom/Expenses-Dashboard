<script setup lang="ts">
import { nextTick, ref } from 'vue';

type Theme = 'system' | 'light' | 'dark';
const props = withDefaults(defineProps<{ modelValue?: Theme | string; label?: string }>(), {
  modelValue: 'system',
  label: 'Theme',
});
// Presentation only: the screen calls applyTheme (apps/web/src/views/theme.ts) on update.
const emit = defineEmits<{ 'update:modelValue': [value: Theme] }>();

const choices: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const buttons = ref<HTMLElement[]>([]);

function choose(i: number) {
  emit('update:modelValue', choices[i]!.value);
  void nextTick(() => buttons.value[i]?.focus());
}
function onKey(e: KeyboardEvent) {
  const i = choices.findIndex((c) => c.value === props.modelValue);
  const last = choices.length - 1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') choose(i >= last ? 0 : i + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') choose(i <= 0 ? last : i - 1);
  else return;
  e.preventDefault();
}
</script>

<template>
  <div class="desk-theme" role="radiogroup" :aria-label="label">
    <button
      v-for="(c, i) in choices"
      :key="c.value"
      :ref="(el) => (buttons[i] = el as HTMLElement)"
      type="button"
      role="radio"
      class="desk-theme-option"
      :class="{ selected: c.value === modelValue }"
      :data-value="c.value"
      :aria-checked="c.value === modelValue"
      :tabindex="c.value === modelValue ? 0 : -1"
      @click="choose(i)"
      @keydown="onKey"
    >
      {{ c.label }}
    </button>
  </div>
</template>

<style scoped>
.desk-theme {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-1);
  gap: var(--space-1);
  background: var(--color-surface);
}
.desk-theme-option {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  padding: var(--space-1) var(--space-3);
  color: var(--color-fg-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.desk-theme-option.selected {
  background: var(--color-accent);
  color: var(--color-accent-fg);
}
.desk-theme-option:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .desk-theme-option {
    min-height: var(--target-min);
    padding-inline: var(--space-4);
  }
}
</style>
