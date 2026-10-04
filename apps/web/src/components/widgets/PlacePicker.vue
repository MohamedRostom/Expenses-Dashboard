<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { Button, Input } from '@desk/ui';
import type { PlaceCandidateT } from '@desk/contracts';
import { toPanelErrorKind, type PanelErrorKind } from '../../utils/errors.js';
import PanelState from '../PanelState.vue';
import { resolvePlace, searchPlaces } from '../../api/places.js';

const props = defineProps<{ previous?: string | undefined }>();
const emit = defineEmits<{ select: [place: PlaceCandidateT] }>();

const DEBOUNCE_MS = 400;
const MIN_CHARS = 3;

const query = ref('');
const candidates = ref<PlaceCandidateT[]>([]);
const near = ref<string | null>(null);
const notice = ref('');
const errorKind = ref<PanelErrorKind | null>(null);
// Search-box copy for the codes /places/* emits; anything else (401, 500) falls through to PanelState.
const SEARCH_COPY: Partial<Record<PanelErrorKind, string>> = {
  rate_limited: 'Please wait a moment before searching again.',
  source_paused: 'Place search is paused, try again later.',
  source_unreachable: 'Place search is unavailable, try again later.',
};
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

const label = (c: PlaceCandidateT) => [c.name, c.admin1, c.country].filter(Boolean).join(', ');

function onInput(value: string) {
  query.value = value;
  clearTimeout(timer);
  if (value.trim().length < MIN_CHARS) return;
  timer = setTimeout(() => void run(value.trim()), DEBOUNCE_MS);
}
onBeforeUnmount(() => clearTimeout(timer));

async function run(q: string) {
  const mine = ++seq;
  notice.value = '';
  errorKind.value = null;
  near.value = null;
  try {
    const res = await searchPlaces(q);
    if (mine !== seq) return;
    candidates.value = res.candidates;
    if (res.candidates.length === 0) {
      notice.value = props.previous
        ? `Place not found, keeping ${props.previous}.`
        : 'Place not found.';
    }
  } catch (err) {
    if (mine !== seq) return;
    candidates.value = [];
    errorKind.value = toPanelErrorKind(err);
  }
}

// The device is asked once, on tap; coordinates go to the server only to find the nearest place.
function useLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const mine = ++seq;
      try {
        const res = await resolvePlace(pos.coords.latitude, pos.coords.longitude);
        if (mine !== seq) return;
        candidates.value = res.candidates;
        near.value = res.candidates[0]?.name ?? null;
        notice.value = '';
      } catch {
        notice.value = 'Search for your place instead.';
      }
    },
    () => {
      // Denied or unavailable: fall back to search, nothing blocks.
      candidates.value = [];
      near.value = null;
    },
  );
}
</script>

<template>
  <div class="desk-place-picker">
    <Input
      :model-value="query"
      label="Search for a place"
      placeholder="Type at least 3 letters"
      @update:model-value="onInput"
    />
    <Button type="button" variant="secondary" data-testid="use-location" @click="useLocation">
      Use my current location (we will ask your device once)
    </Button>
    <p v-if="near" role="status">Near {{ near }} — tap to confirm.</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="errorKind && SEARCH_COPY[errorKind]" role="alert">{{ SEARCH_COPY[errorKind] }}</p>
    <PanelState v-else-if="errorKind" kind="error" :code="errorKind" />
    <ul v-if="candidates.length" class="desk-place-list">
      <li v-for="c in candidates" :key="`${c.lat},${c.lon}`">
        <button
          type="button"
          data-testid="place-candidate"
          class="desk-place-option"
          @click="emit('select', c)"
        >
          {{ label(c) }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.desk-place-picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.desk-place-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.desk-place-option {
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.5rem;
  background: none;
  color: inherit;
  border: 1px solid var(--color-fg);
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}
</style>
