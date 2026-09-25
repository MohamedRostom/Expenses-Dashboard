<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Input } from '@desk/ui';
import { ApiError, apiFetch } from '../api/client.js';
import { useSessionStore, type User } from '../stores/session.js';

const email = ref('');
const password = ref('');
const submitting = ref(false);
const errorMessage = ref('');

const router = useRouter();
const route = useRoute();
const session = useSessionStore();

async function onSubmit() {
  errorMessage.value = '';
  submitting.value = true;
  try {
    const res = await apiFetch<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.value, password: password.value }),
    });
    session.user = res.user;
    // Redirects back to whatever protected route the auth guard bounced the user off of,
    // instead of always dropping them at / regardless of where they were headed.
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      errorMessage.value = 'Wrong email or password.';
    } else if (err instanceof ApiError && err.status === 429) {
      errorMessage.value = 'Too many attempts — try again shortly.';
    } else if (err instanceof ApiError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Something went wrong. Try again.';
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-view">
    <h1>Sign in</h1>
    <form @submit.prevent="onSubmit">
      <Input v-model="email" type="email" label="Email" placeholder="you@example.com" />
      <Input v-model="password" type="password" label="Password" />
      <p v-if="errorMessage" class="auth-error" role="alert">{{ errorMessage }}</p>
      <Button type="submit" :loading="submitting" :disabled="submitting">Sign in</Button>
    </form>
    <p><a href="/auth/google/start">Continue with Google</a></p>
    <p><router-link to="/forgot">Forgot password?</router-link></p>
    <p><router-link to="/register">Create an account</router-link></p>
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
.auth-error {
  color: var(--color-critical);
  font-size: 0.9rem;
  margin: 0;
}
</style>
