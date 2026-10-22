<script setup lang="ts">
import { reactive } from 'vue';
import { content } from '../content';

// The PNGs come from the update-snapshots run; until they are committed (or if one fails to
// load) the figure is dropped rather than left as a broken image.
const failed = reactive(new Set<string>());
</script>

<template>
  <main class="page">
    <div class="intro">
      <section class="hero surface">
        <h1>{{ content.productName }}</h1>
        <p class="tagline">{{ content.tagline }}</p>
        <a :href="content.signUpUrl" class="cta-link">Sign up free</a>
      </section>

      <section class="steps surface" aria-labelledby="how-heading">
        <h2 id="how-heading" class="section-title">How it works</h2>
        <ol>
          <li v-for="(step, i) in content.steps" :key="step.title">
            <span class="step-number">{{ i + 1 }}</span>
            <div>
              <h3>{{ step.title }}</h3>
              <p>{{ step.description }}</p>
            </div>
          </li>
        </ol>
      </section>
    </div>

    <section class="screenshots surface" aria-label="Screenshots">
      <figure
        v-for="shot in content.screenshots"
        v-show="!failed.has(shot.light)"
        :key="shot.light"
      >
        <picture>
          <source :srcset="shot.dark" media="(prefers-color-scheme: dark)" />
          <img
            :src="shot.light"
            :alt="shot.alt"
            width="360"
            height="800"
            loading="lazy"
            @error="failed.add(shot.light)"
          />
        </picture>
      </figure>
    </section>

    <footer class="footer">
      <router-link to="/privacy">Privacy</router-link>
      <router-link to="/terms">Terms</router-link>
    </footer>
  </main>
</template>

<style scoped>
.page {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-6) var(--gutter-fluid) var(--space-8);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-md);
  color: var(--color-fg);
}
.intro {
  display: grid;
  gap: var(--space-6);
  align-items: start;
}
.hero,
.steps,
.screenshots {
  padding: var(--space-4);
}
.hero h1 {
  font-size: var(--text-2xl);
  line-height: var(--leading-2xl);
  letter-spacing: var(--tracking-tight);
  margin: 0 0 var(--space-2);
}
.tagline {
  margin: 0 0 var(--space-4);
}
.cta-link {
  /* A <button> inside an <a> is invalid HTML, so the anchor takes the Button primary look
   * from @desk/ui directly (same tokens, same 44px target). */
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  font-weight: 600;
  border-radius: var(--radius-sm);
  text-decoration: none;
  background: var(--color-accent);
  color: var(--color-accent-fg);
}
.cta-link:focus-visible,
.footer a:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.cta-link:active {
  transform: translateY(1px);
}
.section-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
  line-height: var(--leading-lg);
  font-weight: 600;
  color: var(--color-fg);
}
.steps ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
.steps li {
  display: grid;
  grid-template-columns: var(--space-6) 1fr;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}
.steps li + li {
  border-top: 1px solid var(--color-border);
}
.step-number {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-fg-muted);
}
.steps h3 {
  font-size: var(--text-md);
  line-height: var(--leading-md);
  font-weight: 600;
  margin: 0;
}
.steps p {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  color: var(--color-fg-muted);
}
.screenshots {
  display: grid;
  gap: var(--space-6);
  margin-top: var(--space-8);
}
.screenshots figure {
  margin: 0;
}
.screenshots img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-raised);
}
.footer {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-8);
}
.footer a {
  color: var(--color-fg);
}
@media (min-width: 1024px) {
  .intro {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-12);
    padding-block: var(--space-12);
  }
  .hero h1 {
    font-size: var(--text-display);
    line-height: var(--leading-display);
  }
  .screenshots {
    grid-template-columns: repeat(2, minmax(0, 22rem));
    justify-content: center;
  }
}
</style>
