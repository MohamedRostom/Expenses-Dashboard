<script setup lang="ts">
import type { WidgetT } from '@desk/contracts';

// Stub: the real figures UI lands with US4 (T060); the prop shape is pinned now.
defineProps<{ figures: NonNullable<Extract<WidgetT, { kind: 'sunrise' }>['figures']> }>();
</script>

<template>
  <p class="desk-widget-placeholder">Sunrise and sunset figures</p>
</template>
