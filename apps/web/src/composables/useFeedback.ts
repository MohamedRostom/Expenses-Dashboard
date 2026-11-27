import { ref } from 'vue';

// Module-level, so the sidebar, Settings and the panel itself share one open state.
const open = ref(false);

export function useFeedback() {
  return {
    open,
    openFeedback: () => (open.value = true),
    closeFeedback: () => (open.value = false),
  };
}
