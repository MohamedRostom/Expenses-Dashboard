<script setup lang="ts">
// No props and no script: the preset, tint and pause state are read by CSS from the attributes on
// <html> (data-motion, data-motion-paused, --motion-tint). See DESIGN.md "Background layer".
</script>

<template>
  <div class="desk-motion" aria-hidden="true" data-testid="background-motion">
    <div class="desk-motion__aurora">
      <i class="desk-motion__blob" />
      <i class="desk-motion__blob" />
      <i class="desk-motion__blob" />
    </div>
    <div class="desk-motion__grid" />
    <div class="desk-motion__particles">
      <i class="desk-motion__dots" />
      <i class="desk-motion__dots" />
    </div>
    <svg class="desk-motion__grain" xmlns="http://www.w3.org/2000/svg">
      <filter id="desk-motion-noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves="3"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#desk-motion-noise)" />
    </svg>
  </div>
</template>

<!-- Unscoped on purpose: Settings' .motion-thumb[data-preset] reuses the drawing rules (R12). -->
<style>
.desk-motion {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.desk-motion > * {
  position: absolute;
  display: none;
}
:root[data-motion='aurora'] .desk-motion__aurora,
:root[data-motion='grid'] .desk-motion__grid,
:root[data-motion='particles'] .desk-motion__particles,
:root[data-motion='grain'] .desk-motion__grain {
  display: block;
}
.desk-motion__aurora,
.desk-motion__particles {
  inset: 0;
}

/* Aurora drift: the tint, a fixed Platform blue and a fixed Lamp amber, 80px blur. */
.desk-motion__blob {
  position: absolute;
  inline-size: 58%;
  block-size: 72%;
  border-radius: 50%;
  filter: blur(80px);
  will-change: transform;
  animation: desk-aurora-a 38s ease-in-out infinite alternate;
}
.desk-motion__blob:nth-child(1) {
  inset-block-start: -22%;
  inset-inline-start: -12%;
  background: var(--motion-tint, currentColor);
  opacity: var(--motion-alpha-aurora);
}
.desk-motion__blob:nth-child(2) {
  inset-block-start: 8%;
  inset-inline-end: -16%;
  background: var(--motion-aurora-blue);
  opacity: var(--motion-alpha-aurora-blue);
  animation-name: desk-aurora-b;
  animation-duration: 52s;
}
.desk-motion__blob:nth-child(3) {
  inset-block-end: -34%;
  inset-inline-start: 18%;
  background: var(--motion-aurora-amber);
  opacity: var(--motion-alpha-aurora-amber);
  animation-name: desk-aurora-c;
  animation-duration: 64s;
}
@keyframes desk-aurora-a {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    transform: translate3d(18%, 12%, 0) scale(1.25);
  }
}
@keyframes desk-aurora-b {
  0% {
    transform: translate3d(0, 0, 0) scale(1.1);
  }
  100% {
    transform: translate3d(-20%, 16%, 0) scale(0.9);
  }
}
@keyframes desk-aurora-c {
  0% {
    transform: translate3d(0, 0, 0) scale(0.95);
  }
  100% {
    transform: translate3d(10%, -18%, 0) scale(1.2);
  }
}

/* Board grid: a 48px line grid in the tint, faded out from the top centre, drifting one cell. */
.desk-motion__grid {
  inset: -48px;
  background-image:
    linear-gradient(to right, var(--motion-grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--motion-grid-line) 1px, transparent 1px);
  background-size: 48px 48px;
  opacity: var(--motion-alpha-grid);
  mask-image: radial-gradient(ellipse at 50% 25%, black 25%, transparent 78%);
  will-change: transform;
  animation: desk-grid 26s linear infinite;
}
@keyframes desk-grid {
  to {
    transform: translate(48px, 48px);
  }
}

/* Particles: two tiles of small dots (190px and 120px repeats) rising one tile height. */
.desk-motion__dots {
  position: absolute;
  inset-inline: 0;
  inset-block-start: 0;
  opacity: var(--motion-alpha-particles);
  will-change: transform;
}
.desk-motion__dots:nth-child(1) {
  block-size: calc(100% + 190px);
  background-image:
    radial-gradient(circle at 30% 40%, var(--motion-tint, currentColor) 1.2px, transparent 1.8px),
    radial-gradient(circle at 80% 75%, var(--motion-tint, currentColor) 0.9px, transparent 1.5px);
  background-size: 190px 190px;
  animation: desk-rise-a 80s linear infinite;
}
.desk-motion__dots:nth-child(2) {
  block-size: calc(100% + 120px);
  opacity: calc(var(--motion-alpha-particles) * 0.6);
  background-image: radial-gradient(
    circle at 60% 20%,
    var(--motion-tint, currentColor) 1px,
    transparent 1.6px
  );
  background-size: 120px 120px;
  animation: desk-rise-b 55s linear infinite;
}
@keyframes desk-rise-a {
  to {
    transform: translateY(-190px);
  }
}
@keyframes desk-rise-b {
  to {
    transform: translateY(-120px);
  }
}

/* Grain: an feTurbulence noise rect that steps its position. */
.desk-motion__grain {
  inset-block-start: -8%;
  inset-inline-start: -8%;
  inline-size: 116%;
  block-size: 116%;
  color: var(--motion-tint, currentColor);
  opacity: var(--motion-alpha-grain);
  will-change: transform;
  animation: desk-grain 0.9s steps(5) infinite;
}
@keyframes desk-grain {
  0% {
    transform: translate(0, 0);
  }
  100% {
    transform: translate(-6%, 5%);
  }
}

/* Still: paused when the user or the page asks, no animation under reduced motion or data. The
 * still frame is the base state, i.e. each preset's 0% keyframe. */
:root[data-motion-paused] .desk-motion * {
  animation-play-state: paused;
}
@media (prefers-reduced-motion: reduce) {
  .desk-motion * {
    /* !important: the per-preset rules (nth-child, scoped) are more specific. */
    animation: none !important;
  }
}
@media (prefers-reduced-data: reduce) {
  .desk-motion * {
    /* !important: the per-preset rules (nth-child, scoped) are more specific. */
    animation: none !important;
  }
}
@media (forced-colors: active) {
  .desk-motion {
    display: none;
  }
}
@media print {
  .desk-motion {
    display: none;
  }
}

/* Still thumbnails for Settings' preset radios (R12): the same drawing, no animation. */
.motion-thumb {
  inline-size: 64px;
  block-size: 40px;
  background-color: var(--color-bg);
}
.motion-thumb[data-preset='aurora'] {
  background-image:
    radial-gradient(
      circle at 20% 20%,
      color-mix(
        in srgb,
        var(--motion-tint, currentColor) calc(var(--motion-alpha-aurora) * 100%),
        transparent
      ),
      transparent 60%
    ),
    radial-gradient(
      circle at 85% 90%,
      color-mix(
        in srgb,
        var(--motion-aurora-blue) calc(var(--motion-alpha-aurora-blue) * 100%),
        transparent
      ),
      transparent 60%
    ),
    radial-gradient(
      circle at 60% 50%,
      color-mix(
        in srgb,
        var(--motion-aurora-amber) calc(var(--motion-alpha-aurora-amber) * 100%),
        transparent
      ),
      transparent 55%
    );
}
.motion-thumb[data-preset='grid'] {
  background-image:
    linear-gradient(
      to right,
      color-mix(in srgb, var(--motion-grid-line) calc(var(--motion-alpha-grid) * 100%), transparent)
        1px,
      transparent 1px
    ),
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--motion-grid-line) calc(var(--motion-alpha-grid) * 100%), transparent)
        1px,
      transparent 1px
    );
  background-size: 8px 8px;
}
.motion-thumb[data-preset='particles'] {
  background-image: radial-gradient(
    circle,
    color-mix(
        in srgb,
        var(--motion-tint, currentColor) calc(var(--motion-alpha-particles) * 100%),
        transparent
      )
      1px,
    transparent 1.5px
  );
  background-size: 10px 10px;
}
.motion-thumb[data-preset='grain'] {
  background-image: repeating-conic-gradient(
    color-mix(
        in srgb,
        var(--motion-tint, currentColor) calc(var(--motion-alpha-grain) * 100%),
        transparent
      )
      0 25%,
    transparent 0 50%
  );
  background-size: 3px 3px;
}
</style>
