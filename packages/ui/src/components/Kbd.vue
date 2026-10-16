<template>
  <kbd class="desk-kbd"><slot /></kbd>
</template>

<style scoped>
.desk-kbd {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  padding: 0 var(--space-1);
  color: var(--color-fg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
</style>
