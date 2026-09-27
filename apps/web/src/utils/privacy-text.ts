import type { ProviderIdT } from '@desk/contracts';

/** FR-003: where the provider doesn't offer Desk a revoke API (Microsoft, standards-based),
 * disconnecting still deletes the local row and credential but Desk must tell the user how to
 * remove its access at the provider themselves. Google supports revocation, so it needs none. */
export const REVOKE_INSTRUCTIONS: Partial<Record<ProviderIdT, string>> = {
  microsoft:
    'Desk cannot revoke Microsoft access on its own. To finish removing it, go to ' +
    'account.microsoft.com/privacy under "Apps and services" and remove Desk there too.',
  standards:
    'Desk cannot revoke a standards-based account on its own. To finish removing it, ' +
    "delete or change the app-specific password you created for Desk in that provider's " +
    'account security settings.',
};

export function revokeInstructionsFor(provider: ProviderIdT): string | null {
  return REVOKE_INSTRUCTIONS[provider] ?? null;
}
