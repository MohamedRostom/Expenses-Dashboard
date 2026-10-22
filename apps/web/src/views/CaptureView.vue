<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Button, PanelFrame, Select, useToast } from '@desk/ui';
import type {
  CaptureMappingResponseT,
  CategoryResponseT,
  ListCaptureTokensResponseT,
  RotateCaptureTokenResponseT,
} from '@desk/contracts';
import { ApiError, apiFetch } from '../api/client.js';
import { formatDateTime } from '../utils/format.js';

const toast = useToast();

const tokens = ref<ListCaptureTokensResponseT['tokens']>([]);
const loading = ref(true);
const loadError = ref('');

// Only ever populated right after issue/rotate — never fetched or persisted.
const revealedUrl = ref('');
const revealedSecret = ref('');
const rotating = ref(false);

const categories = ref<CategoryResponseT[]>([]);
const mappings = ref<Record<string, string>>({});
const unmappedLabels = ref<string[]>([]);
const mappingSaving = ref(false);

async function loadTokens() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await apiFetch<ListCaptureTokensResponseT>('/capture/tokens');
    tokens.value = res.tokens;
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : 'Failed to load capture tokens.';
  } finally {
    loading.value = false;
  }
}

async function loadMapping() {
  const [catRes, mapRes] = await Promise.all([
    apiFetch<{ categories: CategoryResponseT[] }>('/categories'),
    apiFetch<CaptureMappingResponseT>('/capture/mapping'),
  ]);
  categories.value = catRes.categories.filter((c) => !c.archivedAt);
  mappings.value = Object.fromEntries(mapRes.mappings.map((m) => [m.label, m.categoryId]));
  unmappedLabels.value = mapRes.unmappedLabels;
}

onMounted(async () => {
  await loadTokens();
  await loadMapping().catch(() => {
    // ponytail: mapping load failure is non-fatal — the token address above still works.
  });
});

async function rotate() {
  rotating.value = true;
  try {
    const res = await apiFetch<RotateCaptureTokenResponseT>('/capture/tokens/generic/rotate', {
      method: 'POST',
    });
    revealedUrl.value = res.url;
    revealedSecret.value = res.secret;
    await loadTokens();
    toast.push('New capture address issued. The old one no longer works.');
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Failed to rotate token.', 'critical');
  } finally {
    rotating.value = false;
  }
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(revealedUrl.value);
    toast.push('Copied.');
  } catch {
    toast.push('Could not copy — select and copy manually.', 'critical');
  }
}

async function setLabelCategory(label: string, categoryId: string) {
  mappings.value = { ...mappings.value, [label]: categoryId };
  mappingSaving.value = true;
  try {
    await apiFetch<CaptureMappingResponseT>('/capture/mapping', {
      method: 'PUT',
      body: JSON.stringify({
        mappings: Object.entries(mappings.value).map(([l, categoryId]) => ({
          label: l,
          categoryId,
        })),
      }),
    });
    await loadMapping();
  } catch (err) {
    toast.push(err instanceof ApiError ? err.message : 'Failed to save mapping.', 'critical');
  } finally {
    mappingSaving.value = false;
  }
}

function categoryOptions() {
  return categories.value.map((c) => ({ value: c.id, label: c.name }));
}

// Every label ever seen: mapped ones plus the still-unmapped ones the API reports.
function allLabels(): string[] {
  return [...new Set([...Object.keys(mappings.value), ...unmappedLabels.value])];
}
</script>

<template>
  <main class="capture-view">
    <h1>Phone capture</h1>
    <p>
      Send an expense with one HTTPS request from your phone — no session, just the address below as
      a bearer credential in the URL.
    </p>

    <div class="capture-grid board-grid">
      <PanelFrame heading="Capture address">
        <div class="capture-body">
          <p v-if="loading">Loading…</p>
          <p v-else-if="loadError" role="alert" class="error-text">{{ loadError }}</p>
          <template v-else>
            <ul v-if="tokens.length > 0" class="token-list">
              <li v-for="t in tokens" :key="t.id">
                {{ t.label }} — {{ t.revokedAt ? 'revoked' : 'active' }}
                <span v-if="t.lastUsedAt"> · last used {{ formatDateTime(t.lastUsedAt) }}</span>
              </li>
            </ul>
            <p v-else>No capture address yet.</p>
          </template>

          <div v-if="revealedUrl" class="revealed">
            <p>
              <strong>Your new address (shown once — copy it now):</strong>
            </p>
            <code>{{ revealedUrl }}</code>
            <Button variant="secondary" @click="copyUrl">Copy</Button>
          </div>

          <p role="alert" class="warn-text">
            Rotating issues a new address and immediately invalidates the old one — update any
            automations before you rotate.
          </p>
          <Button :loading="rotating" :disabled="rotating" @click="rotate">
            {{ tokens.length > 0 ? 'Rotate address' : 'Create capture address' }}
          </Button>

          <details>
            <summary>iOS Shortcut example</summary>
            <p>
              Add a "Get Contents of URL" action: Method <code>POST</code>, Request Body
              <code>JSON</code> with fields <code>amount</code>, <code>currency</code>,
              <code>description</code>, and optionally <code>category</code> and <code>id</code>;
              URL is the address above.
            </p>
          </details>
        </div>
      </PanelFrame>

      <PanelFrame heading="Category mapping">
        <div class="capture-body">
          <p>Map the free-text <code>category</code> label your automation sends to a category.</p>
          <table v-if="allLabels().length > 0" class="mapping-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="label in allLabels()" :key="label">
                <td>{{ label }}</td>
                <td>
                  <Select
                    :model-value="mappings[label] ?? ''"
                    :options="categoryOptions()"
                    @update:model-value="(v) => setLabelCategory(label, v)"
                  />
                </td>
                <td>
                  <span v-if="!mappings[label]" class="unmapped-badge">unmapped</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else>No labels captured yet.</p>
        </div>
      </PanelFrame>
    </div>
  </main>
</template>

<style scoped>
.capture-view {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4) var(--gutter-fluid) var(--space-12);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  font-family: var(--font-sans);
  color: var(--color-fg);
}
h1,
p {
  margin: 0;
}
h1 {
  font-size: var(--text-2xl);
  line-height: var(--leading-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
}
.capture-grid {
  align-items: start;
  /* A flex-column child with margin-inline auto would shrink to content; span the page instead. */
  inline-size: 100%;
  max-width: none;
  margin-inline: 0;
}
.capture-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
}
/* Buttons keep their own width, like every other panel action. */
.capture-body > :deep(.desk-btn) {
  align-self: start;
}
.token-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.revealed {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding-inline-start: var(--space-3);
  border-inline-start: var(--space-1) solid var(--color-accent);
}
.revealed code {
  font-family: var(--font-mono);
  word-break: break-all;
}
.error-text,
.warn-text {
  padding-inline-start: var(--space-3);
  border-inline-start: var(--space-1) solid var(--color-critical);
}
.warn-text {
  border-inline-start-color: var(--color-warn);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}
summary {
  display: flex;
  align-items: center;
  min-height: var(--target-min);
  cursor: pointer;
  text-decoration: underline;
}
summary:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.mapping-table {
  width: 100%;
  border-collapse: collapse;
}
.mapping-table th {
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-fg-muted);
  text-align: start;
  padding: var(--space-2);
}
.mapping-table td {
  padding: var(--space-2);
  border-top: 1px solid var(--color-border);
}
.unmapped-badge {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  padding-inline-start: var(--space-2);
  border-inline-start: var(--space-1) solid var(--color-warn);
}
@media (min-width: 1024px) {
  summary {
    min-height: 24px;
  }
}
</style>
