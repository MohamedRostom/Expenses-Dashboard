<script setup lang="ts">
import { useId } from 'vue';

// "Desk" is the working name until ADR-0002 is accepted; renaming the product is this one line.
const PRODUCT_NAME = 'Desk';
// Gradient ids must be unique per instance, or a second logo on the page paints with the first's.
const id = useId();
const cell = `${id}-cell`;
const cellLow = `${id}-cell-low`;
const silver = `${id}-silver`;
</script>

<template>
  <!-- The Desk sign: a silver D crossed by two cobalt bars, a currency sign of its own, on a
       graphite split-flap cell. Fixed brand colours: the same mark on light and dark grounds.
       Source of the app icons: public/icons/desk-mark.svg (keep the two in step). -->
  <p class="desk-logo">
    <svg class="desk-logo-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient :id="cell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2e3440" />
          <stop offset="1" stop-color="#1a1e27" />
        </linearGradient>
        <linearGradient :id="cellLow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#171a22" />
          <stop offset="1" stop-color="#0c0e13" />
        </linearGradient>
        <linearGradient :id="silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="0.55" stop-color="#dfe4ec" />
          <stop offset="1" stop-color="#9aa3b2" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" :fill="`url(#${cell})`" />
      <path
        d="M0 24 H48 V37 A11 11 0 0 1 37 48 H11 A11 11 0 0 1 0 37 Z"
        :fill="`url(#${cellLow})`"
      />
      <rect x="4" y="0.6" width="40" height="0.7" rx="0.35" fill="#ffffff" opacity="0.22" />
      <path
        class="desk-logo-d"
        d="M18.5 12.5 H24 A11.5 11.5 0 0 1 24 35.5 H18.5 Z"
        fill="none"
        :stroke="`url(#${silver})`"
        stroke-width="3.4"
        stroke-linejoin="round"
      />
      <rect
        class="desk-logo-bar"
        x="11"
        y="19.6"
        width="17.5"
        height="2.6"
        rx="1.3"
        fill="#3d6bff"
      />
      <rect
        class="desk-logo-bar"
        x="11"
        y="25.8"
        width="17.5"
        height="2.6"
        rx="1.3"
        fill="#3d6bff"
      />
    </svg>
    <span class="desk-logo-name">{{ PRODUCT_NAME }}</span>
  </p>
</template>

<style scoped>
.desk-logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
}
.desk-logo-mark {
  flex: none;
  width: var(--space-10);
  height: var(--space-10);
}
/* Wide uppercase in the system stack (DESIGN.md loads no web fonts); the DOM text stays "Desk"
   so screen readers say the word, not the letters. */
.desk-logo-name {
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--color-fg);
}
/* Forced colours drop gradient paint; keep the sign visible as system ink. */
@media (forced-colors: active) {
  .desk-logo-mark rect,
  .desk-logo-mark path:not(.desk-logo-d) {
    fill: Canvas;
  }
  .desk-logo-d {
    stroke: CanvasText;
  }
  .desk-logo-mark .desk-logo-bar {
    fill: CanvasText;
  }
}
</style>
