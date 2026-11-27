<script setup lang="ts">
import { Button, ErrorState } from '@desk/ui';

defineProps<{ code?: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <main class="desk-boot-error">
    <ErrorState v-bind="code ? { code } : {}">
      <template #action>
        <Button @click="$emit('retry')">Retry</Button>
      </template>
    </ErrorState>
  </main>
</template>

<style scoped>
.desk-boot-error {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-6) var(--gutter-fluid);
}
</style>
