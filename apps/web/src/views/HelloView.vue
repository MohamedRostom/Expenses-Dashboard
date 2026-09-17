<script setup lang="ts">
import { HealthResponse, type HealthResponseT } from '@desk/contracts';
import { onMounted, ref } from 'vue';

const health = ref<HealthResponseT | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const res = await fetch('/healthz');
    if (!res.ok) throw new Error(`healthz returned ${res.status}`);
    health.value = HealthResponse.parse(await res.json());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<template>
  <main>
    <h1>Hello from Desk</h1>
    <p v-if="error" role="alert">Could not reach the API: {{ error }}</p>
    <p v-else-if="!health" aria-busy="true">Checking the API…</p>
    <p v-else data-testid="health">
      API <code>{{ health.version }}</code> at <code>{{ health.sha }}</code>
    </p>
  </main>
</template>

<style scoped>
main {
  max-width: 40rem;
  margin: 4rem auto;
  padding: 0 1rem;
}
h1 {
  color: var(--color-accent);
}
code {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
