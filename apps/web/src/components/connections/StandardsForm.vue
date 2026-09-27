<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { AccountT, CapabilityT, ProviderPresetT } from '@desk/contracts';
import { postStandardsConnection } from '../../api/connections.js';
import { standardsErrorCopy } from '../../utils/errors.js';

const props = withDefaults(
  defineProps<{
    presets: ProviderPresetT[];
    mode?: 'connect' | 'reconnect';
    reconnectAccount?: { id: string; address: string; capabilities: CapabilityT[] } | null;
  }>(),
  { mode: 'connect', reconnectAccount: null },
);
const emit = defineEmits<{ success: [account: AccountT] }>();

const isReconnect = computed(() => props.mode === 'reconnect');

const presetOptions = computed(() => [
  { value: '', label: 'Choose a preset (optional)' },
  ...props.presets.map((p) => ({ value: p.name, label: p.name })),
  { value: 'other', label: 'Other' },
]);

const preset = ref('');
const address = ref(isReconnect.value ? (props.reconnectAccount?.address ?? '') : '');
const password = ref('');
const imapHost = ref('');
const imapPort = ref('');
const caldavUrl = ref('');
const mailChecked = ref(false);
const calendarChecked = ref(false);

function onPresetChange() {
  const found = props.presets.find((p) => p.name === preset.value);
  if (!found) return;
  imapHost.value = found.imapHost;
  imapPort.value = String(found.imapPort);
  caldavUrl.value = found.caldavUrl;
}

const submitting = ref(false);
const submitError = ref<string | null>(null);
const capabilityError = ref<string | null>(null);
const errorSummaryEl = ref<HTMLElement | null>(null);
const errorSummaryId = 'standards-form-error-summary';
const capabilityErrorId = 'standards-form-capability-error';

async function focusErrorSummary() {
  await nextTick();
  errorSummaryEl.value?.focus();
}

async function onSubmit() {
  submitError.value = null;
  capabilityError.value = null;

  const capabilities: CapabilityT[] = isReconnect.value
    ? (props.reconnectAccount?.capabilities ?? [])
    : [
        ...(mailChecked.value ? (['mail'] as const) : []),
        ...(calendarChecked.value ? (['calendar'] as const) : []),
      ];

  if (capabilities.length === 0) {
    capabilityError.value = 'Choose mail, calendar or both';
    await focusErrorSummary();
    return;
  }

  submitting.value = true;
  try {
    const payload = isReconnect.value
      ? {
          address: props.reconnectAccount!.address,
          password: password.value,
          capabilities,
        }
      : {
          address: address.value,
          password: password.value,
          ...(imapHost.value ? { imapHost: imapHost.value } : {}),
          ...(imapPort.value ? { imapPort: Number(imapPort.value) } : {}),
          ...(caldavUrl.value ? { caldavUrl: caldavUrl.value } : {}),
          capabilities,
        };
    const res = await postStandardsConnection(payload);
    emit('success', res.account);
  } catch (err) {
    submitError.value = standardsErrorCopy(err);
    await focusErrorSummary();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form class="standards-form" @submit.prevent="onSubmit">
    <div
      v-if="submitError || capabilityError"
      :id="errorSummaryId"
      ref="errorSummaryEl"
      data-testid="standards-form-error-summary"
      role="alert"
      tabindex="-1"
      class="error-summary"
    >
      <p>There was a problem</p>
      <p v-if="submitError">{{ submitError }}</p>
      <p v-if="capabilityError">{{ capabilityError }}</p>
    </div>

    <template v-if="!isReconnect">
      <label class="desk-field">
        <span class="desk-field-label">Preset</span>
        <select v-model="preset" name="preset" class="desk-select" @change="onPresetChange">
          <option v-for="opt in presetOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>

      <label class="desk-field">
        <span class="desk-field-label">Address</span>
        <input v-model="address" name="address" type="email" class="desk-input" required />
      </label>
    </template>

    <p v-else class="reconnect-address">
      Reconnecting <strong>{{ props.reconnectAccount?.address }}</strong>
    </p>

    <label class="desk-field">
      <span class="desk-field-label">App password</span>
      <input v-model="password" name="password" type="password" class="desk-input" required />
      <span class="password-note">This is never shown again once saved.</span>
    </label>

    <template v-if="!isReconnect">
      <label class="desk-field">
        <span class="desk-field-label">IMAP host</span>
        <input v-model="imapHost" name="imapHost" type="text" class="desk-input" />
      </label>

      <label class="desk-field">
        <span class="desk-field-label">IMAP port</span>
        <input v-model="imapPort" name="imapPort" type="number" class="desk-input" />
      </label>

      <label class="desk-field">
        <span class="desk-field-label">CalDAV URL</span>
        <input v-model="caldavUrl" name="caldavUrl" type="text" class="desk-input" />
      </label>

      <fieldset
        data-testid="capability-group"
        class="capability-group"
        :aria-describedby="capabilityError ? capabilityErrorId : undefined"
      >
        <legend>What should Desk connect?</legend>
        <label class="capability-item">
          <input v-model="mailChecked" name="capability-mail" type="checkbox" />
          Mail
        </label>
        <label class="capability-item">
          <input v-model="calendarChecked" name="capability-calendar" type="checkbox" />
          Calendar
        </label>
        <span v-if="capabilityError" :id="capabilityErrorId" class="desk-field-error">{{
          capabilityError
        }}</span>
      </fieldset>
    </template>

    <button type="submit" class="submit-btn" :disabled="submitting">
      {{ isReconnect ? 'Reconnect' : 'Connect' }}
    </button>
  </form>
</template>

<style scoped>
.standards-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 24rem;
}
.desk-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-family: var(--font-sans);
  color: var(--color-fg);
}
.desk-field-label {
  font-size: 0.85rem;
}
.desk-input,
.desk-select {
  font-family: var(--font-sans);
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-fg);
  background: var(--color-bg);
  color: var(--color-fg);
}
.password-note {
  font-size: 0.75rem;
  color: var(--color-fg-secondary);
}
.capability-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.capability-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.desk-field-error {
  font-size: 0.8rem;
  color: var(--color-critical);
}
.error-summary {
  border: 1px solid var(--color-critical);
  color: var(--color-critical);
  border-radius: 6px;
  padding: 0.75rem;
}
.error-summary p {
  margin: 0;
}
.error-summary p + p {
  margin-top: 0.25rem;
}
.reconnect-address {
  font-size: 0.9rem;
}
.submit-btn {
  align-self: flex-start;
  padding: 0.6rem 1.2rem;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 0.4rem;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
}
.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
