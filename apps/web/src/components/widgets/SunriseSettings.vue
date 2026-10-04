<script setup lang="ts">
import { ref } from 'vue';
import type { PlaceCandidateT, WidgetPatchT, WidgetT } from '@desk/contracts';
import PlacePicker from './PlacePicker.vue';
import { toPanelErrorKind, type PanelErrorKind } from '../../utils/errors.js';
import PanelState from '../PanelState.vue';

const props = defineProps<{ widget: WidgetT; patch: (body: WidgetPatchT) => Promise<unknown> }>();
const error = ref<PanelErrorKind | null>(null);

async function choose(place: PlaceCandidateT) {
  error.value = null;
  try {
    await props.patch({ place });
  } catch (err) {
    error.value = toPanelErrorKind(err);
  }
}
</script>

<template>
  <div class="desk-sunrise-settings">
    <p v-if="widget.place">Current place: {{ widget.place.name }}</p>
    <PlacePicker :previous="widget.place?.name" @select="choose" />
    <PanelState v-if="error" kind="error" :code="error" />
  </div>
</template>
