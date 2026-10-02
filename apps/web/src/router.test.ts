import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useSessionStore } from './stores/session.js';
import { useFlagsStore } from './stores/flags.js';
import { router } from './router.js';

describe('router auth guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('redirects an unauthenticated visitor from a requiresAuth route to /login', async () => {
    const session = useSessionStore();
    vi.spyOn(session, 'load').mockResolvedValue();

    await router.push('/settings');

    expect(router.currentRoute.value.name).toBe('login');
  });

  it('allows navigation to a public route without loading the session', async () => {
    const session = useSessionStore();
    const loadSpy = vi.spyOn(session, 'load').mockResolvedValue();

    await router.push('/login');

    expect(router.currentRoute.value.name).toBe('login');
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('redirects /today to / when panels.today is off', async () => {
    const session = useSessionStore();
    const flags = useFlagsStore();
    session.user = {
      id: '1',
      email: 'test@test.com',
      defaultCurrency: 'GBP',
      theme: 'light',
      timeZone: 'UTC',
      onboardingCompletedAt: new Date().toISOString(),
    };
    vi.spyOn(flags, 'load').mockResolvedValue();

    await router.push('/today');

    expect(router.currentRoute.value.name).toBe('home');
  });

  it('allows navigation to /today when panels.today is on', async () => {
    const session = useSessionStore();
    const flags = useFlagsStore();
    session.user = {
      id: '1',
      email: 'test@test.com',
      defaultCurrency: 'GBP',
      theme: 'light',
      timeZone: 'UTC',
      onboardingCompletedAt: new Date().toISOString(),
    };
    vi.spyOn(session, 'load').mockResolvedValue();
    vi.spyOn(flags, 'load').mockResolvedValue();
    vi.spyOn(flags, 'isOn').mockReturnValue(true);

    await router.push('/today');

    expect(router.currentRoute.value.name).toBe('today');
  });

  it('redirects /settings/connections to / when panels.today is off', async () => {
    const session = useSessionStore();
    const flags = useFlagsStore();
    session.user = {
      id: '1',
      email: 'test@test.com',
      defaultCurrency: 'GBP',
      theme: 'light',
      timeZone: 'UTC',
      onboardingCompletedAt: new Date().toISOString(),
    };
    vi.spyOn(flags, 'load').mockResolvedValue();

    await router.push('/settings/connections');

    expect(router.currentRoute.value.name).toBe('home');
  });

  it('allows navigation to /settings/connections when panels.today is on', async () => {
    const session = useSessionStore();
    const flags = useFlagsStore();
    session.user = {
      id: '1',
      email: 'test@test.com',
      defaultCurrency: 'GBP',
      theme: 'light',
      timeZone: 'UTC',
      onboardingCompletedAt: new Date().toISOString(),
    };
    vi.spyOn(session, 'load').mockResolvedValue();
    vi.spyOn(flags, 'load').mockResolvedValue();
    vi.spyOn(flags, 'isOn').mockReturnValue(true);

    await router.push('/settings/connections');

    expect(router.currentRoute.value.name).toBe('settings-connections');
  });
});
