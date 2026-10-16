<script setup lang="ts">
import { nextTick, ref, useId } from 'vue';

const props = defineProps<{
  tabs: { id: string; label: string }[];
  modelValue: string;
  label: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [id: string] }>();

const uid = useId();
const tabId = (id: string) => `${uid}-tab-${id}`;
const panelId = `${uid}-panel`;
const buttons = ref<HTMLElement[]>([]);

function select(index: number) {
  const tab = props.tabs[index];
  if (!tab) return;
  emit('update:modelValue', tab.id);
  void nextTick(() => buttons.value[index]?.focus());
}
function onKey(e: KeyboardEvent) {
  const i = props.tabs.findIndex((t) => t.id === props.modelValue);
  const last = props.tabs.length - 1;
  const next: Record<string, number> = {
    ArrowRight: i >= last ? 0 : i + 1,
    ArrowLeft: i <= 0 ? last : i - 1,
    Home: 0,
    End: last,
  };
  if (!(e.key in next)) return;
  e.preventDefault();
  select(next[e.key]!);
}
</script>

<template>
  <div class="desk-tabs">
    <div class="desk-tablist" role="tablist" :aria-label="label">
      <button
        v-for="(t, i) in tabs"
        :id="tabId(t.id)"
        :key="t.id"
        :ref="(el) => (buttons[i] = el as HTMLElement)"
        type="button"
        role="tab"
        class="desk-tab"
        :class="{ selected: t.id === modelValue }"
        :aria-selected="t.id === modelValue"
        :aria-controls="t.id === modelValue ? panelId : undefined"
        :tabindex="t.id === modelValue ? 0 : -1"
        @click="select(i)"
        @keydown="onKey"
      >
        {{ t.label }}
      </button>
    </div>
    <div :id="panelId" role="tabpanel" :aria-labelledby="tabId(modelValue)" class="desk-tabpanel">
      <slot :name="modelValue" />
      <slot />
    </div>
  </div>
</template>

<style scoped>
.desk-tablist {
  display: flex;
  gap: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.desk-tab {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  padding: var(--space-2) var(--space-1);
  background: transparent;
  color: var(--color-fg-muted);
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}
.desk-tab:hover {
  color: var(--color-fg);
}
.desk-tab.selected {
  color: var(--color-fg);
  border-bottom-color: var(--color-accent);
}
.desk-tab:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.desk-tabpanel {
  padding-top: var(--space-4);
}
@media (max-width: 767px) {
  .desk-tab {
    min-height: var(--target-min);
    padding-inline: var(--space-2);
  }
}
</style>
