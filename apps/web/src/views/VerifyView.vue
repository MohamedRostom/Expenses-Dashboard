<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, ErrorState, Skeleton } from '@desk/ui';
import { ApiError, apiFetch } from '../api/client.js';
import { useSessionStore, type User } from '../stores/session.js';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const status = ref<'pending' | 'success' | 'error'>('pending');
const error = ref<ApiError | null>(null);

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
</script>

<template>
  <div class="auth-view">
    <h1>Verify your email</h1>
    <Skeleton v-if="status === 'pending'" />
    <ErrorState
      v-else-if="status === 'error'"
      :code="error?.code ?? 'validation_failed'"
      title="That link expired or was already used"
      description="Request a new verification email to finish signing up."
    >
      <template #action>
        <Button variant="secondary" @click="router.push('/register')">Get a new link</Button>
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
</style>
