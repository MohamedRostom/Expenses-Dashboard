<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Button } from '@desk/ui';
import { MOTION_PRESET_IDS, MOTION_SWATCHES } from '@desk/contracts';
import type { MotionPresetId, PatchMeResponseT } from '@desk/contracts';
import { ApiError, apiFetch } from '../../api/client.js';
import { useSessionStore } from '../../stores/session.js';

/** Settings › Appearance › background motion (spec 006 US1). Every control previews at once by
 * writing session.user (App.vue's watch re-runs applyMotion) and saves through one coalesced
 * queue (research R9): 400 ms after the last change, one PATCH /me in flight, fields merged. */
const props = defineProps<{ theme: string }>();

const session = useSessionStore();

const PRESETS: Record<MotionPresetId, { label: string; blurb: string }> = {
  none: { label: 'None', blurb: 'A still ground, nothing moves.' },
  aurora: { label: 'Aurora drift', blurb: 'Soft colour washes drifting slowly.' },
  grid: { label: 'Board grid', blurb: 'A fine grid that shimmers like a departures board.' },
  particles: { label: 'Particles', blurb: 'Small points floating upward. The default.' },
  grain: { label: 'Grain', blurb: 'A quiet film grain.' },
};
const SWATCH_NAMES: Record<string, string> = {
  'signal-mint': 'Signal mint',
  'platform-blue': 'Platform blue',
  'lamp-amber': 'Lamp amber',
  'dusk-violet': 'Dusk violet',
  coral: 'Coral',
  silver: 'Silver',
};

type Patch = {
  motionPreset?: MotionPresetId;
  motionColour?: string;
  panelsTranslucent?: boolean;
  motionPaused?: boolean;
};

const preset = computed(() => session.user?.motionPreset ?? 'particles');
const colour = computed(() => (session.user?.motionColour ?? '#7fd1a8').toLowerCase());
const translucent = computed(() => session.user?.panelsTranslucent !== false);
const paused = computed(() => session.user?.motionPaused === true);

// The colour row belongs to light only; "system" follows the OS (the same split as applyTheme).
const dark = computed(() =>
  props.theme === 'system'
    ? typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    : props.theme === 'dark',
);

// Radio-group keyboard pattern: one swatch in the tab order (the checked one, else the first),
// arrow keys move to and pick the next one.
const focusHex = computed(() =>
  MOTION_SWATCHES.some((s) => s.hex === colour.value) ? colour.value : MOTION_SWATCHES[0]!.hex,
);
function onSwatchKey(e: KeyboardEvent, i: number) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const n = MOTION_SWATCHES.length;
  const next = MOTION_SWATCHES[(i + step + n) % n]!;
  queue({ motionColour: next.hex });
  const buttons = (e.currentTarget as HTMLElement).parentElement?.querySelectorAll('button');
  (buttons?.[(i + step + n) % n] as HTMLElement | undefined)?.focus();
}

const error = ref('');
let pending: Patch = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
const hasPending = () => Object.keys(pending).length > 0;

function preview(p: Patch) {
  if (session.user) session.user = { ...session.user, ...p };
}

function queue(p: Patch) {
  preview(p);
  Object.assign(pending, p);
  error.value = '';
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void flush();
  }, 400);
}

async function flush() {
  if (inFlight || !hasPending()) return;
  const body = pending;
  pending = {};
  inFlight = true;
  try {
    const res = await apiFetch<PatchMeResponseT>('/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    // A newer change is already showing; this older response must not overwrite it.
    if (res.user && !hasPending() && !timer) session.user = res.user as typeof session.user;
  } catch (err) {
    pending = { ...body, ...pending };
    error.value = errorCopy(err);
    inFlight = false;
    return;
  }
  inFlight = false;
  if (hasPending() && !timer) void flush();
}

function errorCopy(err: unknown): string {
  if (!(err instanceof ApiError))
    return "You look to be offline. Your change is showing here but isn't saved yet.";
  switch (err.code) {
    case 'unauthenticated':
      return 'Your session has ended. Sign in again, then pick your background.';
    case 'rate_limited':
      return 'Too many changes in a short while. Wait a moment, then try again.';
    case 'validation_failed':
      return 'That value was not accepted. Pick another.';
    default:
      return "Couldn't save your appearance. Your change is showing here but isn't saved yet.";
  }
}

function retry() {
  error.value = '';
  void flush();
}

onBeforeUnmount(() => {
  // Send what is queued rather than lose it when the user leaves Settings within 400 ms.
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
    void flush();
  }
});
</script>

<template>
  <div class="desk-appearance">
    <div
      class="desk-appearance-group"
      role="radiogroup"
      aria-label="Background motion"
      aria-describedby="desk-appearance-motion-help"
    >
      <span id="desk-appearance-motion-help" class="desk-appearance-hint"
        >Saved to your account and shown on every screen.</span
      >
      <label
        v-for="id in MOTION_PRESET_IDS"
        :key="id"
        class="desk-appearance-preset"
        :data-checked="preset === id"
      >
        <input
          type="radio"
          name="settings-motion-preset"
          :value="id"
          :checked="preset === id"
          :aria-checked="preset === id"
          :aria-labelledby="`desk-motion-${id}-name`"
          :aria-describedby="`desk-motion-${id}-blurb`"
          @change="queue({ motionPreset: id })"
        />
        <span class="motion-thumb" :data-preset="id" aria-hidden="true"></span>
        <span class="desk-appearance-text">
          <span :id="`desk-motion-${id}-name`" class="desk-appearance-name">{{
            PRESETS[id].label
          }}</span>
          <span :id="`desk-motion-${id}-blurb`" class="desk-appearance-blurb">{{
            PRESETS[id].blurb
          }}</span>
        </span>
      </label>
    </div>

    <div
      v-if="!dark"
      class="desk-appearance-group desk-appearance-colours"
      role="radiogroup"
      aria-label="Motion colour"
      :aria-disabled="preset === 'none' ? 'true' : undefined"
    >
      <button
        v-for="(s, i) in MOTION_SWATCHES"
        :key="s.id"
        type="button"
        role="radio"
        class="desk-appearance-swatch"
        :style="{ '--swatch': s.hex }"
        :aria-label="SWATCH_NAMES[s.id]"
        :title="SWATCH_NAMES[s.id]"
        :aria-checked="colour === s.hex"
        :tabindex="s.hex === focusHex ? 0 : -1"
        :disabled="preset === 'none'"
        @click="queue({ motionColour: s.hex })"
        @keydown="onSwatchKey($event, i)"
      ></button>
      <label class="desk-appearance-custom">
        <input
          type="color"
          aria-label="Custom colour"
          :value="colour"
          :disabled="preset === 'none'"
          @input="preview({ motionColour: ($event.target as HTMLInputElement).value })"
          @change="queue({ motionColour: ($event.target as HTMLInputElement).value })"
        />
        <span>Custom</span>
      </label>
      <p v-if="preset === 'none'" class="desk-appearance-hint">Applies when a motion is on.</p>
    </div>

    <div class="desk-appearance-switches">
      <button
        type="button"
        role="switch"
        class="desk-appearance-switch"
        aria-label="Translucent panels"
        :aria-checked="translucent"
        @click="queue({ panelsTranslucent: !translucent })"
      >
        <span class="desk-appearance-track" aria-hidden="true"></span>
        <span>Translucent panels</span>
      </button>
      <button
        type="button"
        role="switch"
        class="desk-appearance-switch"
        aria-label="Pause background motion"
        :aria-checked="paused"
        @click="queue({ motionPaused: !paused })"
      >
        <span class="desk-appearance-track" aria-hidden="true"></span>
        <span>Pause background motion</span>
      </button>
    </div>

    <div v-if="error" class="desk-appearance-error">
      <p role="alert">{{ error }}</p>
      <Button type="button" variant="secondary" @click="retry">Try again</Button>
    </div>
  </div>
</template>

<style scoped>
.desk-appearance {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.desk-appearance-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--space-2);
}
.desk-appearance-hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-appearance-preset {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--target-min);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
}
.desk-appearance-preset[data-checked='true'] {
  border: 2px solid var(--color-accent);
}
.desk-appearance-preset input {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.desk-appearance-preset:has(input:focus-visible),
.desk-appearance-swatch:focus-visible,
.desk-appearance-custom:has(input:focus-visible),
.desk-appearance-switch:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.motion-thumb {
  flex: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.desk-appearance-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.desk-appearance-name {
  font-weight: 600;
}
.desk-appearance-blurb {
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
.desk-appearance-colours {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.desk-appearance-colours[aria-disabled='true'] {
  opacity: 0.6;
}
/* Bare round colour buttons (board): 44px, the colour is the whole control. */
.desk-appearance-swatch {
  flex: none;
  inline-size: var(--target-min);
  block-size: var(--target-min);
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--swatch);
  cursor: pointer;
}
.desk-appearance-swatch[aria-checked='true'] {
  border: 3px solid var(--color-fg);
  box-shadow: 0 0 0 2px var(--color-accent);
}
.desk-appearance-custom {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
  cursor: pointer;
}
.desk-appearance-custom input {
  inline-size: var(--target-min);
  block-size: var(--target-min);
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
}
.desk-appearance-custom input::-webkit-color-swatch-wrapper {
  padding: 0;
}
.desk-appearance-custom input::-webkit-color-swatch {
  border: 1px solid var(--color-border);
  border-radius: 50%;
}
.desk-appearance-custom input::-moz-color-swatch {
  border: 1px solid var(--color-border);
  border-radius: 50%;
}
.desk-appearance-switches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-6);
}
.desk-appearance-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--target-min);
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-fg);
  font: inherit;
  cursor: pointer;
}
.desk-appearance-track {
  position: relative;
  flex: none;
  inline-size: var(--space-10);
  block-size: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-raised);
}
.desk-appearance-track::after {
  content: '';
  position: absolute;
  inset-block: 2px;
  inset-inline-start: 2px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--color-fg-muted);
}
.desk-appearance-switch[aria-checked='true'] .desk-appearance-track {
  background: var(--color-accent);
  border-color: var(--color-accent);
}
.desk-appearance-switch[aria-checked='true'] .desk-appearance-track::after {
  inset-inline-start: auto;
  inset-inline-end: 2px;
  background: var(--color-accent-fg);
}
.desk-appearance-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.desk-appearance-error p {
  margin: 0;
  color: var(--color-critical);
}
</style>
