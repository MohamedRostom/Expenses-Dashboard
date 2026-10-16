<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, ErrorState, Input } from '@desk/ui';
import { ApiError, apiFetch } from '../api/client.js';

const route = useRoute();
const router = useRouter();

const password = ref('');
const submitting = ref(false);
const done = ref(false);
const tokenError = ref<ApiError | null>(null);

async function onSubmit() {
  tokenError.value = null;
  submitting.value = true;
  try {
    const token = String(route.query.token ?? '');
    await apiFetch<void>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password: password.value }),
    });
    done.value = true;
  } catch (err) {
    tokenError.value =
      err instanceof ApiError ? err : new ApiError('validation_failed', 'Reset failed', 0);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="auth-view surface">
    <h1>Set a new password</h1>

    <div v-if="done" role="status">
      <p class="auth-links">
        Your password was reset. <router-link to="/login">Sign in</router-link>
      </p>
    </div>

    <div v-else-if="tokenError" role="alert">
      <ErrorState
        :code="tokenError.code"
        title="That link expired or was already used"
        description="Request a new reset link to continue."
      >
        <template #action>
          <Button variant="secondary" @click="router.push('/forgot')">Get a new link</Button>
        </template>
      </ErrorState>
    </div>

    <form v-else @submit.prevent="onSubmit">
      <Input
        v-model="password"
        type="password"
        label="New password"
        placeholder="12-128 characters"
      />
      <Button type="submit" :loading="submitting" :disabled="submitting">Reset password</Button>
    </form>
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
