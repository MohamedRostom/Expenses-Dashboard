<script setup lang="ts">
import { content } from '../content';
</script>

<template>
  <main class="page">
    <section class="hero">
      <h1>{{ content.productName }}</h1>
      <p class="tagline">{{ content.tagline }}</p>
      <a :href="content.signUpUrl" class="cta-link">Sign up free</a>
    </section>

    <section class="steps" aria-label="How it works">
      <ol>
        <li v-for="(step, i) in content.steps" :key="step.title">
          <span class="step-number">{{ i + 1 }}</span>
          <h2>{{ step.title }}</h2>
          <p>{{ step.description }}</p>
        </li>
      </ol>
    </section>

    <footer class="footer">
      <router-link to="/privacy">Privacy</router-link>
      <router-link to="/terms">Terms</router-link>
    </footer>
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
.hero {
  text-align: center;
  padding-block: 2rem;
}
.hero h1 {
  font-size: 2rem;
  margin: 0 0 0.5rem;
}
.tagline {
  margin: 0 0 1.5rem;
  opacity: 0.85;
}
.cta-link {
  /* Was <a><Button>...</Button></a> — a <button> nested inside an <a> is invalid HTML (two
   * interactive elements, one inside the other) and confusing for assistive tech. Styled to
   * match @desk/ui's Button "primary" variant directly on the anchor instead. */
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-sans);
  font-size: 0.9rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  text-decoration: none;
  background: var(--color-accent);
  color: var(--color-bg);
}
.steps ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.steps li {
  border: 1px solid color-mix(in srgb, var(--color-fg) 15%, transparent);
  border-radius: 8px;
  padding: 1rem;
}
.step-number {
  display: inline-block;
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-weight: bold;
}
.steps h2 {
  font-size: 1.1rem;
  margin: 0.25rem 0 0.25rem;
}
.steps p {
  margin: 0;
  opacity: 0.85;
}
.footer {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 2rem;
}
</style>
