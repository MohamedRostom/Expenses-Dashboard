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
  <div class="auth-view">
    <h1>Set a new password</h1>

    <div v-if="done" class="check-email">
      <p>Your password was reset. <router-link to="/login">Sign in</router-link></p>
    </div>

    <ErrorState
      v-else-if="tokenError"
      :code="tokenError.code"
      title="That link expired or was already used"
      description="Request a new reset link to continue."
    >
      <template #action>
        <Button variant="secondary" @click="router.push('/forgot')">Get a new link</Button>
      </template>
    </ErrorState>

    <form v-else @submit.prevent="onSubmit">
      <Input
        v-model="password"
        type="password"
        label="New password"
        placeholder="12-128 characters"
      />
      <Button type="submit" :loading="submitting" :disabled="submitting">Reset password</Button>
    </form>
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
