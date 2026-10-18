<script lang="ts">
export const SCENE_COUNT = 10;
/** How long each scene holds before the next crossfades in. */
export const HOLD_MS = 8000;
</script>

<script setup lang="ts">
// Signed-out pages only (ADR-0007 amendment 2026-10-18): ten CSS-only scenes in the Desk sign's
// palette, shown in a shuffled order that covers every scene before any repeats. Opacity and
// transform only. Still under the motion flag being off, reduced motion, reduced data, or a
// hidden tab; then one scene holds.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ animate: boolean }>();

function shuffle(avoidFirst?: number): number[] {
  const a = Array.from({ length: SCENE_COUNT }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  // A new round never opens on the scene the last one closed on.
  if (a[0] === avoidFirst) [a[0], a[1]] = [a[1]!, a[0]!];
  return a;
}

const order = ref(shuffle());
const pos = ref(0);
const current = computed(() => order.value[pos.value]);

const prefers = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
const still = computed(
  () =>
    !props.animate ||
    prefers('(prefers-reduced-motion: reduce)') ||
    prefers('(prefers-reduced-data: reduce)'),
);

let timer: ReturnType<typeof setInterval> | undefined;
function step() {
  if (pos.value === SCENE_COUNT - 1) {
    order.value = shuffle(current.value);
    pos.value = 0;
  } else {
    pos.value++;
  }
}
function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
function start() {
  stop();
  if (still.value || document.visibilityState === 'hidden') return;
  timer = setInterval(step, HOLD_MS);
}
const onVisibility = () => (document.visibilityState === 'hidden' ? stop() : start());

// Flags load after mount, so the motion switch can turn on late.
watch(() => props.animate, start);
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  start();
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  stop();
});
</script>

<template>
  <div class="desk-auth-backdrop" :class="{ 'is-still': still }" aria-hidden="true">
    <div
      v-for="n in SCENE_COUNT"
      :key="n"
      class="desk-auth-scene"
      :class="[`desk-auth-scene--${n}`, { 'is-active': current === n - 1 }]"
      :data-scene="n"
    />
  </div>
</template>

<!-- Not scoped: the palette switches on the <html> theme states, and every class is prefixed. -->
<style>
.desk-auth-backdrop {
  --ab-base: #e6eaf1;
  --ab-1: #7f9bff; /* cobalt */
  --ab-2: #a9d4ff; /* ice */
  --ab-3: #9aa6b8; /* steel */
  --ab-4: #b8c6e0; /* navy, lifted for light */
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: var(--ab-base);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .desk-auth-backdrop {
    --ab-base: #07080b;
    --ab-1: #2f5bff;
    --ab-2: #5aa8ff;
    --ab-3: #8a94a6;
    --ab-4: #10264d;
  }
}
:root[data-theme='dark'] .desk-auth-backdrop {
  --ab-base: #07080b;
  --ab-1: #2f5bff;
  --ab-2: #5aa8ff;
  --ab-3: #8a94a6;
  --ab-4: #10264d;
}
.desk-auth-scene {
  position: absolute;
  inset: -4%;
  opacity: 0;
  transform: scale(1);
  transition:
    opacity 2.4s ease-in-out,
    transform 12s linear;
}
.desk-auth-scene.is-active {
  opacity: 1;
  transform: scale(1.06);
}
.desk-auth-backdrop.is-still .desk-auth-scene {
  transition: none;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .desk-auth-scene {
    transition: none;
    transform: none;
  }
}

/* 1. Cobalt bloom */
.desk-auth-scene--1 {
  background:
    radial-gradient(
      60% 55% at 15% 18%,
      color-mix(in srgb, var(--ab-1) 55%, transparent),
      transparent 70%
    ),
    radial-gradient(
      50% 45% at 88% 85%,
      color-mix(in srgb, var(--ab-2) 35%, transparent),
      transparent 70%
    );
}
/* 2. Ice horizon */
.desk-auth-scene--2 {
  background:
    radial-gradient(
      90% 45% at 50% 105%,
      color-mix(in srgb, var(--ab-1) 50%, transparent),
      transparent 70%
    ),
    linear-gradient(180deg, transparent 50%, color-mix(in srgb, var(--ab-2) 18%, transparent));
}
/* 3. Steel sheen */
.desk-auth-scene--3 {
  background:
    linear-gradient(
      115deg,
      transparent 28%,
      color-mix(in srgb, var(--ab-3) 22%, transparent) 44%,
      transparent 58%
    ),
    radial-gradient(
      55% 50% at 82% 12%,
      color-mix(in srgb, var(--ab-4) 70%, transparent),
      transparent 70%
    );
}
/* 4. Board grid, after the concourse board */
.desk-auth-scene--4 {
  background:
    repeating-linear-gradient(
      0deg,
      color-mix(in srgb, var(--ab-3) 10%, transparent) 0 1px,
      transparent 1px 56px
    ),
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--ab-3) 10%, transparent) 0 1px,
      transparent 1px 56px
    ),
    radial-gradient(
      45% 40% at 50% 45%,
      color-mix(in srgb, var(--ab-1) 40%, transparent),
      transparent 70%
    );
}
/* 5. Flap seams */
.desk-auth-scene--5 {
  background:
    repeating-linear-gradient(
      180deg,
      transparent 0 71px,
      color-mix(in srgb, var(--ab-3) 14%, transparent) 71px 72px
    ),
    radial-gradient(
      60% 50% at 80% 20%,
      color-mix(in srgb, var(--ab-1) 45%, transparent),
      transparent 70%
    ),
    radial-gradient(
      50% 50% at 10% 90%,
      color-mix(in srgb, var(--ab-4) 70%, transparent),
      transparent 70%
    );
}
/* 6. Halo */
.desk-auth-scene--6 {
  background:
    radial-gradient(70% 70% at 50% 50%, transparent 35%, var(--ab-base) 100%),
    conic-gradient(
      from 200deg at 72% 38%,
      color-mix(in srgb, var(--ab-1) 40%, transparent),
      color-mix(in srgb, var(--ab-2) 18%, transparent),
      transparent 35%,
      color-mix(in srgb, var(--ab-4) 55%, transparent) 60%,
      color-mix(in srgb, var(--ab-1) 40%, transparent)
    );
}
/* 7. Twin orbs */
.desk-auth-scene--7 {
  background:
    radial-gradient(
      35% 35% at 25% 70%,
      color-mix(in srgb, var(--ab-1) 55%, transparent),
      transparent 70%
    ),
    radial-gradient(
      30% 30% at 76% 28%,
      color-mix(in srgb, var(--ab-2) 40%, transparent),
      transparent 70%
    );
}
/* 8. Midnight */
.desk-auth-scene--8 {
  background:
    radial-gradient(
      120% 70% at 50% -10%,
      color-mix(in srgb, var(--ab-4) 85%, transparent),
      transparent 70%
    ),
    radial-gradient(
      25% 20% at 50% 100%,
      color-mix(in srgb, var(--ab-2) 25%, transparent),
      transparent 70%
    );
}
/* 9. Diagonal bands */
.desk-auth-scene--9 {
  background:
    repeating-linear-gradient(
      135deg,
      transparent 0 140px,
      color-mix(in srgb, var(--ab-4) 30%, transparent) 140px 280px
    ),
    radial-gradient(
      50% 50% at 20% 20%,
      color-mix(in srgb, var(--ab-1) 40%, transparent),
      transparent 70%
    );
}
/* 10. The Desk sign's two bars */
.desk-auth-scene--10 {
  background:
    linear-gradient(
      180deg,
      transparent 42%,
      color-mix(in srgb, var(--ab-1) 22%, transparent) 42% 45.5%,
      transparent 45.5% 54.5%,
      color-mix(in srgb, var(--ab-1) 22%, transparent) 54.5% 58%,
      transparent 58%
    ),
    radial-gradient(
      55% 50% at 70% 50%,
      color-mix(in srgb, var(--ab-2) 30%, transparent),
      transparent 70%
    );
}
</style>
