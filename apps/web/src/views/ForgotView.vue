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
  <main class="auth-view">
    <h1>Reset your password</h1>

    <div v-if="submitted" role="status">
      <p>If that email exists, a reset link was sent.</p>
    </div>

    <form v-else @submit.prevent="onSubmit">
      <Input v-model="email" type="email" label="Email" placeholder="you@example.com" />
      <Button type="submit" :loading="submitting" :disabled="submitting">Send reset link</Button>
    </form>

    <p class="auth-links"><router-link to="/login">Back to sign in</router-link></p>
  </main>
</template>

<style scoped>
.auth-view {
  max-width: 24rem;
  margin: var(--space-8) auto;
  padding-inline: var(--gutter);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.auth-view h1 {
  margin: 0;
  font-size: var(--text-2xl);
  line-height: var(--leading-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
}
.auth-view p {
  margin: 0;
}
form,
.resend-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.auth-links a {
  display: inline-flex;
  align-items: center;
  min-height: var(--target-min);
  color: var(--color-fg);
  text-decoration: underline;
}
@media (min-width: 1024px) {
  .auth-links a {
    min-height: 24px;
  }
}
</style>
