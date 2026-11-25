import { ref } from 'vue';

/** Set by the router guard when the session cannot load (non-401, nothing cached); App.vue shows BootError. */
export const bootError = ref<{ code?: string | undefined } | null>(null);
