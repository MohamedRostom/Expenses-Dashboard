<script setup lang="ts">
import { content } from '../content';
</script>

<template>
  <main class="page">
    <p class="draft-notice">
      Draft placeholder — not reviewed by counsel. Replace before any production launch.
    </p>
    <h1>Privacy Policy</h1>
    <p>Last updated: placeholder date.</p>

    <h2>What we collect</h2>
    <p>
      Account details (email, password hash), the expense data you enter, and, if you connect them,
      data from Notion or a webhook you configure. {{ content.productName }} does not sell your data
      or use it for advertising.
    </p>

    <h2>How we use it</h2>
    <p>
      To run the service: show your expenses, convert currencies, and sync to Notion if you ask.
    </p>

    <h2>Third parties</h2>
    <p>
      Exchange rates from frankfurter.app (ECB). Notion, only if you connect it. No analytics or ad
      tracking is enabled by default.
    </p>

    <h2>Your rights</h2>
    <p>Export or delete your account and data at any time from account settings.</p>

    <h2>Contact</h2>
    <p>Open an issue on the project's GitHub repository.</p>

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
