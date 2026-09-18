import { onMounted, onUnmounted, ref } from 'vue';

const VISIT_COUNT_KEY = 'desk_visit_count';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Surfaces the PWA install prompt after the visitor's second visit (research.md R18).
 * Visit count is a per-browser localStorage tally, wrapped in try/catch per artifact rules
 * for private-browsing/blocked-storage environments. */
export function useInstallPrompt() {
  const canInstall = ref(false);
  let deferred: BeforeInstallPromptEvent | null = null;

  function visitedAtLeastTwice(): boolean {
    try {
      const count = Number(localStorage.getItem(VISIT_COUNT_KEY) ?? '0') + 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(count));
      return count >= 2;
    } catch {
      return false;
    }
  }

  function onBeforeInstallPrompt(e: Event) {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    canInstall.value = visitedAtLeastTwice();
  }

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  });
  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  });

  async function promptInstall(): Promise<void> {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    canInstall.value = false;
  }

  return { canInstall, promptInstall };
}
