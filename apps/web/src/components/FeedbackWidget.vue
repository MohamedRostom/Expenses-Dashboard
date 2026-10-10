<script setup lang="ts">
// T112: small footer feedback form. Page auto-fills from the route; disabled offline (same
// navigator.onLine check toPanelErrorKind/ExpenseForm.vue already use — no new detection
// pattern); shows the rate-limit message inline on a 429.
import { computed, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button } from '@desk/ui';
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
    <Button class="feedback-toggle" @click="open = !open">
      {{ open ? 'Close feedback' : 'Feedback' }}
    </Button>
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
        <input v-model="contactOk" type="checkbox" class="feedback-check" :disabled="!isOnline" />
        <span class="feedback-consent-text">OK to contact me about this</span>
      </label>
      <Button type="submit" :disabled="!canSubmit || status.kind === 'sending'">Send</Button>
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
  right: var(--space-4);
  bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-family: var(--font-sans);
  z-index: 20;
}
/* A flap on the Raised shadow; the panel above it is an overlay. */
.feedback-toggle {
  order: 2;
  box-shadow: var(--shadow-raised);
}
.feedback-form {
  order: 1;
  margin-bottom: var(--space-2);
  width: 18rem;
  max-width: calc(100vw - 2 * var(--space-4));
  box-sizing: border-box;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  color: var(--color-fg);
  box-shadow: var(--shadow-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.feedback-form textarea {
  box-sizing: border-box;
  width: 100%;
}
.feedback-offline {
  color: var(--color-warn);
  margin: 0;
}
.feedback-count {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--color-fg-muted);
  margin: 0;
}
.feedback-count.over {
  color: var(--color-critical);
}
.feedback-consent {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--target-min);
  font-size: var(--text-sm);
}
/* The real checkbox is stretched over the whole label (a 44px target) and hidden; the box is drawn. */
.feedback-check {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.feedback-consent-text::before {
  content: '';
  display: inline-block;
  box-sizing: border-box;
  width: var(--space-5);
  height: var(--space-5);
  margin-right: var(--space-2);
  vertical-align: middle;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-accent-fg);
  line-height: var(--space-5);
  text-align: center;
}
.feedback-check:checked + .feedback-consent-text::before {
  content: '\2713';
  background: var(--color-accent);
  border-color: var(--color-accent);
}
.feedback-check:focus-visible + .feedback-consent-text::before {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.feedback-check:disabled + .feedback-consent-text {
  opacity: 0.6;
}
@media (min-width: 1024px) {
  .feedback-consent {
    min-height: var(--space-6);
  }
}
</style>
