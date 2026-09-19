<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, ErrorState, Input, Skeleton } from '@desk/ui';
import { ApiError, apiFetch } from '../api/client.js';
import { useSessionStore, type User } from '../stores/session.js';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const status = ref<'pending' | 'success' | 'error'>('pending');
const error = ref<ApiError | null>(null);

// "Get a new link" used to send the user to /register, which silently no-ops for an existing
// (even unverified) email — there was no actual way to get a new link for an expired one.
const resendEmail = ref('');
const resendState = ref<'idle' | 'sending' | 'sent'>('idle');

onMounted(async () => {
  const token = String(route.query.token ?? '');
  if (!token) {
    status.value = 'error';
    error.value = new ApiError('validation_failed', 'Missing verification token', 400);
    return;
  }
  try {
    const res = await apiFetch<{ user: User }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    session.user = res.user;
    status.value = 'success';
    await router.push('/');
  } catch (err) {
    status.value = 'error';
    error.value =
      err instanceof ApiError ? err : new ApiError('validation_failed', 'Verification failed', 0);
  }
});

async function resend() {
  if (!resendEmail.value) return;
  resendState.value = 'sending';
  try {
    await apiFetch('/auth/verify/resend', {
      method: 'POST',
      body: JSON.stringify({ email: resendEmail.value }),
    });
  } catch {
    // Always show "sent" regardless — the endpoint itself never reveals whether the email
    // exists, so a network-level failure is the only distinguishable case, and even that isn't
    // worth surfacing differently here.
  } finally {
    resendState.value = 'sent';
  }
}
</script>

<template>
  <div class="auth-view">
    <h1>Verify your email</h1>
    <Skeleton v-if="status === 'pending'" />
    <ErrorState
      v-else-if="status === 'error'"
      :code="error?.code ?? 'validation_failed'"
      title="That link expired or was already used"
      description="Enter your email to get a new verification link."
    >
      <template #action>
        <p v-if="resendState === 'sent'">
          If that email has an account, a new verification link is on its way.
        </p>
        <form v-else class="resend-form" @submit.prevent="resend">
          <Input v-model="resendEmail" type="email" label="Email" placeholder="you@example.com" />
          <Button type="submit" :loading="resendState === 'sending'">Get a new link</Button>
        </form>
      </template>
    </ErrorState>
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
.resend-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
