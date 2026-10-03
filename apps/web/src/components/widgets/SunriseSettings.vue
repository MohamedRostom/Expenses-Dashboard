<script setup lang="ts">
import { ref } from 'vue';
import type { PlaceCandidateT, WidgetPatchT, WidgetT } from '@desk/contracts';
import PlacePicker from './PlacePicker.vue';

const props = defineProps<{ widget: WidgetT; patch: (body: WidgetPatchT) => Promise<unknown> }>();
const error = ref('');

async function choose(place: PlaceCandidateT) {
  error.value = '';
  try {
    await props.patch({ place });
  } catch {
    error.value = "Couldn't save that place.";
  }
}
</script>

<template>
  <div class="desk-sunrise-settings">
    <p v-if="widget.place">Current place: {{ widget.place.name }}</p>
    <PlacePicker :previous="widget.place?.name" @select="choose" />
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
