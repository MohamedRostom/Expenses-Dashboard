import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { useSessionStore } from './stores/session.js';
import { router } from './router.js';

describe('router auth guard', () => {
  it('redirects an unauthenticated visitor from a requiresAuth route to /login', async () => {
    setActivePinia(createPinia());
    const session = useSessionStore();
    vi.spyOn(session, 'load').mockResolvedValue();

    await router.push('/settings');

    expect(router.currentRoute.value.name).toBe('login');
  });

  it('allows navigation to a public route without loading the session', async () => {
    setActivePinia(createPinia());
    const session = useSessionStore();
    const loadSpy = vi.spyOn(session, 'load').mockResolvedValue();

    await router.push('/login');

    expect(router.currentRoute.value.name).toBe('login');
    expect(loadSpy).not.toHaveBeenCalled();
  });
});
