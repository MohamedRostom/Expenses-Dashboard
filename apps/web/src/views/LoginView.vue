<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, ErrorState, Input } from '@desk/ui';
import { ApiError, apiFetch } from '../api/client.js';
import { useSessionStore, type User } from '../stores/session.js';

const email = ref('');
const password = ref('');
const submitting = ref(false);
const errorCode = ref('');

// Sign-in's own wording per cause; the API answers a bad password with `unauthenticated`.
const causeMessages = {
  unauthenticated: {
    title: 'Wrong email or password',
    description: 'Check both and try again.',
  },
  rate_limited: {
    title: 'Too many attempts',
    description: 'Wait a few minutes, then try again.',
  },
  email_unverified: {
    title: 'Confirm your email',
    description: 'Open the link we sent you, then sign in.',
  },
};

const router = useRouter();
const route = useRoute();
const session = useSessionStore();

async function onSubmit() {
  errorCode.value = '';
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
    errorCode.value = err instanceof ApiError ? err.code : 'internal';
  } finally {
    submitting.value = false;
  }
}

// A full-page navigation: the OAuth start route redirects to Google.
function googleSignIn() {
  window.location.assign('/auth/google/start');
}
</script>

<template>
  <main class="auth-view surface">
    <h1>Sign in</h1>
    <form @submit.prevent="onSubmit">
      <Input v-model="email" type="email" label="Email" placeholder="you@example.com" />
      <Input v-model="password" type="password" label="Password" />
      <div v-if="errorCode" role="alert">
        <ErrorState :key="errorCode" :code="errorCode" :cause-messages="causeMessages" />
      </div>
      <Button type="submit" :loading="submitting" :disabled="submitting">Sign in</Button>
    </form>
    <Button variant="secondary" @click="googleSignIn">Continue with Google</Button>
    <p class="auth-links">
      <router-link to="/forgot">Forgot password?</router-link>
      <router-link to="/register">Create an account</router-link>
    </p>
  </main>
</template>

<style scoped>
.auth-view {
  max-width: 28rem;
  box-sizing: border-box;
  width: calc(100% - 2 * var(--gutter));
  margin: var(--space-8) auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.auth-links {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
}
.auth-links a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-fg);
  text-decoration: underline;
}
@media (min-width: 1024px) {
  .auth-links a {
    min-height: 24px;
  }
}
</style>
