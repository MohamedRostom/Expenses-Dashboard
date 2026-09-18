<script setup lang="ts">
import { ref } from 'vue';
import { Button, Input } from '@desk/ui';
import { apiFetch } from '../api/client.js';

const email = ref('');
const submitting = ref(false);
const submitted = ref(false);

async function onSubmit() {
  submitting.value = true;
  try {
    await apiFetch<Record<string, never>>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email: email.value }),
    });
  } finally {
    // 202-always semantics: show the generic success state even on failure,
    // so the response never leaks whether the email exists.
    submitted.value = true;
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-view">
    <h1>Reset your password</h1>

    <div v-if="submitted" class="check-email">
      <p>If that email exists, a reset link was sent.</p>
    </div>

    <form v-else @submit.prevent="onSubmit">
      <Input v-model="email" type="email" label="Email" placeholder="you@example.com" />
      <Button type="submit" :loading="submitting" :disabled="submitting">Send reset link</Button>
    </form>

    <p><router-link to="/login">Back to sign in</router-link></p>
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
