<script setup lang="ts">
import { content } from '../content';
</script>

<template>
  <main class="page">
    <p class="draft-notice">
      Draft placeholder — not reviewed by counsel. Replace before any production launch.
    </p>
    <h1>Terms of Service</h1>
    <p>Last updated: placeholder date.</p>

    <h2>The service</h2>
    <p>
      {{ content.productName }} is provided as-is, during a public beta, with no uptime or accuracy
      guarantee. Do not rely on it as your sole record of financial data.
    </p>

    <h2>Your account</h2>
    <p>You are responsible for the accuracy of data you enter and for keeping your login secure.</p>

    <h2>Acceptable use</h2>
    <p>No automated abuse of the capture webhook, no attempts to access another user's data.</p>

    <h2>Changes and termination</h2>
    <p>We may change or discontinue the service, and you may delete your account, at any time.</p>

    <h2>Liability</h2>
    <p>
      Provided without warranty. To the extent permitted by law, the maintainers are not liable for
      losses arising from use of the service.
    </p>

    <router-link to="/">Back home</router-link>
  </main>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
  background: var(--color-bg);
}
.draft-notice {
  background: color-mix(in srgb, var(--color-warn) 15%, transparent);
  border: 1px solid var(--color-warn);
  border-radius: 6px;
  padding: 0.75rem;
  font-size: 0.9rem;
}
</style>
