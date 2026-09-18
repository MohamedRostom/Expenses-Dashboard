// Single source of truth for landing copy. ADR-0002 (product name) is still undecided — when it
// is, `productName` here is the only line that needs to change. `screenshots` is empty because no
// real app screenshots exist yet; fill it in once Phase 4 UI is ready to capture.
export interface Step {
  title: string;
  description: string;
}

export interface Screenshot {
  src: string;
  alt: string;
}

export const content = {
  productName: 'Desk',
  tagline: 'One place for every expense, in every currency you spend it in.',
  steps: [
    {
      title: 'Add expenses in any currency',
      description:
        'Log what you spent and in what currency — Desk converts it to your default currency automatically, using daily published rates.',
    },
    {
      title: 'See your month and year at a glance',
      description:
        'Category bars, budgets and totals for the month or the year, with a table view always one tap away.',
    },
    {
      title: 'Sync to Notion or capture from your phone',
      description:
        'Optionally two-way sync with your own Notion workspace, or auto-capture entries from a phone automation — nothing to type twice.',
    },
  ] satisfies Step[],
  screenshots: [] as Screenshot[],
  // Relative path: landing and app are expected to share an origin in production (a reverse
  // proxy or the same Fly app serving both). Point this at a full URL via env if that changes.
  signUpUrl: '/register',
};
