<script setup lang="ts">
import { ref } from 'vue';
import { Button, ErrorState, Input } from '@desk/ui';
import { ApiError, apiFetch } from '../api/client.js';
import CurrencyPicker from '../components/CurrencyPicker.vue';

// ponytail: Intl has no direct "default currency for locale" API — a small region
// lookup covers the common cases; unknown regions default to GBP.
function guessCurrency(): string {
  const region = navigator.language.split('-')[1]?.toUpperCase();
  const byRegion: Record<string, string> = {
    US: 'USD',
    GB: 'GBP',
    CA: 'CAD',
    AU: 'AUD',
    JP: 'JPY',
    DE: 'EUR',
    FR: 'EUR',
    ES: 'EUR',
    IT: 'EUR',
    IE: 'EUR',
  };
  return (region && byRegion[region]) ?? 'GBP';
}

const email = ref('');
const password = ref('');
const currency = ref(guessCurrency());
const submitting = ref(false);
const submitted = ref(false);
const error = ref<ApiError | null>(null);

async function onSubmit() {
  error.value = null;
  submitting.value = true;
  try {
    await apiFetch<Record<string, never>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        defaultCurrency: currency.value,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    submitted.value = true;
  } catch (err) {
    error.value =
      err instanceof ApiError ? err : new ApiError('validation_failed', 'Request failed', 0);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-view">
    <h1>Create your account</h1>

    <div v-if="submitted" class="check-email">
      <p>Check your email to verify your account and finish signing up.</p>
    </div>

    <form v-else @submit.prevent="onSubmit">
      <Input v-model="email" type="email" label="Email" placeholder="you@example.com" />
      <Input v-model="password" type="password" label="Password" placeholder="12-128 characters" />
      <CurrencyPicker v-model="currency" label="Default currency" />
      <ErrorState v-if="error" :code="error.code" />
      <Button type="submit" :loading="submitting" :disabled="submitting">Sign up</Button>
    </form>

    <p><router-link to="/login">Already have an account? Sign in</router-link></p>
  </div>
</template>

<style scoped>
.auth-view {
  max-width: 24rem;
  margin: 2rem auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
}
form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
</style>
