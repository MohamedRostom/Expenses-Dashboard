<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Select } from '@desk/ui';
import { apiFetch } from '../api/client.js';
import { useSessionStore } from '../stores/session.js';

const session = useSessionStore();
const router = useRouter();

// research.md/design ponytail: no per-step persistence — onboarding shows from step 1 every
// time until onboardingCompletedAt is set (skip or finish), which is simple and matches "keep
// it simple" guidance; a full resume-from-exact-step would need extra server state for no
// real benefit in a 3-step wizard.
const step = ref(1);
const currency = ref(session.user?.defaultCurrency ?? 'GBP');
const currencyOptions = [
  { value: 'GBP', label: 'GBP' },
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
];

async function complete() {
  await apiFetch('/me', {
    method: 'PATCH',
    body: JSON.stringify({ onboardingCompletedAt: new Date().toISOString() }),
  });
  if (session.user) session.user.defaultCurrency = currency.value;
  void router.push({ name: 'home' });
}

async function next() {
  if (step.value === 1) {
    await apiFetch('/me', {
      method: 'PATCH',
      body: JSON.stringify({ defaultCurrency: currency.value }),
    });
  }
  if (step.value < 3) {
    step.value += 1;
  } else {
    await complete();
  }
}

function skip() {
  void complete();
}
</script>

<template>
  <main class="desk-onboarding">
    <p class="desk-onboarding-step">Step {{ step }} of 3</p>

    <section v-if="step === 1">
      <h1>Set your default currency</h1>
      <Select v-model="currency" label="Default currency" :options="currencyOptions" />
    </section>

    <section v-else-if="step === 2">
      <h1>Add your first expense</h1>
      <p>Head to the add-expense form to log your first entry, or skip for now.</p>
      <Button @click="router.push({ name: 'add' })">Add an expense</Button>
    </section>

    <section v-else>
      <h1>Connect Notion (optional)</h1>
      <p>Sync your expenses to a Notion database. You can do this anytime from settings.</p>
      <Button @click="router.push({ name: 'settings-connectors' })">Connect Notion</Button>
    </section>

    <div class="desk-onboarding-actions">
      <Button type="button" variant="secondary" @click="skip">Skip</Button>
      <Button type="button" @click="next">{{ step < 3 ? 'Next' : 'Finish' }}</Button>
    </div>
  </main>
</template>

<style scoped>
.desk-onboarding {
  max-width: 28rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.desk-onboarding-step {
  font-size: 0.8rem;
  opacity: 0.7;
  margin: 0;
}
.desk-onboarding-actions {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}
</style>
