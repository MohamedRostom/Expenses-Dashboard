<script setup lang="ts">
// T112: small footer feedback form. Page auto-fills from the route; disabled offline (same
// navigator.onLine check toPanelErrorKind/ExpenseForm.vue already use — no new detection
// pattern); shows the rate-limit message inline on a 429.
import { computed, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch, ApiError } from '../api/client.js';

const MAX_LENGTH = 2000;

const route = useRoute();
const page = computed(() => (typeof route.name === 'string' ? route.name : location.pathname));

const open = ref(false);
const message = ref('');
const contactOk = ref(false);
const status = reactive<{ kind: 'idle' | 'sending' | 'sent' | 'rate_limited' | 'error' }>({
  kind: 'idle',
});

const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
function goOnline() {
  isOnline.value = true;
}
function goOffline() {
  isOnline.value = false;
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);
  onUnmounted(() => {
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
  });
}

const remaining = computed(() => MAX_LENGTH - message.value.length);
const canSubmit = computed(
  () => isOnline.value && message.value.trim().length > 0 && remaining.value >= 0,
);

async function submit() {
  if (!canSubmit.value) return;
  status.kind = 'sending';
  try {
    await apiFetch('/feedback', {
      method: 'POST',
      body: JSON.stringify({
        page: page.value,
        message: message.value,
        contactOk: contactOk.value,
      }),
    });
    status.kind = 'sent';
    message.value = '';
    contactOk.value = false;
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) {
      status.kind = 'rate_limited';
    } else {
      status.kind = 'error';
    }
  }
}
</script>

<template>
  <div class="feedback-widget">
    <button type="button" class="feedback-toggle" @click="open = !open">
      {{ open ? 'Close feedback' : 'Feedback' }}
    </button>
    <form v-if="open" class="feedback-form" @submit.prevent="submit">
      <p v-if="!isOnline" class="feedback-offline" role="status">
        You're offline — feedback can't be sent right now.
      </p>
      <label class="desk-field">
        <span class="desk-field-label">What's on your mind?</span>
        <textarea
          v-model="message"
          class="desk-input"
          rows="4"
          :maxlength="MAX_LENGTH"
          :disabled="!isOnline || status.kind === 'sending'"
        />
      </label>
      <p class="feedback-count" :class="{ over: remaining < 0 }">{{ remaining }} characters left</p>
      <label class="feedback-consent">
        <input v-model="contactOk" type="checkbox" :disabled="!isOnline" />
        OK to contact me about this
      </label>
      <button type="submit" :disabled="!canSubmit || status.kind === 'sending'">Send</button>
      <p v-if="status.kind === 'sent'" role="status">Thanks — feedback sent.</p>
      <p v-if="status.kind === 'rate_limited'" role="alert">
        Too much feedback for now — try again in a bit.
      </p>
      <p v-if="status.kind === 'error'" role="alert">Couldn't send that. Try again.</p>
    </form>
  </div>
</template>

<style scoped>
.feedback-widget {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  font-family: var(--font-sans);
  z-index: 20;
}
.feedback-toggle {
  border-radius: 999px;
  padding: 0.5rem 1rem;
  background: var(--color-accent);
  color: white;
  border: none;
}
.feedback-form {
  margin-top: 0.5rem;
  width: 18rem;
  max-width: calc(100vw - 2rem);
  padding: 1rem;
  border-radius: 0.75rem;
  background: var(--color-bg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.feedback-offline {
  color: var(--color-warn);
  margin: 0;
}
.feedback-count {
  font-size: 0.8rem;
  opacity: 0.7;
  margin: 0;
}
.feedback-count.over {
  color: var(--color-critical);
}
.feedback-consent {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
}
</style>
