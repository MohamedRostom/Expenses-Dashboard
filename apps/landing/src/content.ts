// Single source of truth for landing copy. ADR-0002 (product name) is still undecided: when it
// is, `productName` here is the only line that needs to change. The screenshots are generated
// from the running app by tests/e2e/tests/screenshots.spec.ts (spec 004 T050) into
// public/screenshots/ with a manifest.json; regenerate them through the update-snapshots workflow.
export interface Step {
  title: string;
  description: string;
}

export interface Screenshot {
  /** Light and dark renders of the same screen; the page switches on prefers-color-scheme. */
  light: string;
  dark: string;
  alt: string;
}

export const content = {
  productName: 'Desk',
  tagline: 'One place for every expense, in every currency you spend it in.',
  steps: [
    {
      title: 'Add an expense in any currency',
      description: 'Desk converts it at the day’s published rate and keeps the original amount.',
    },
    {
      title: 'See where the month stands',
      description: 'Category bars against budgets, with a table view always one tap away.',
    },
    {
      title: 'Sync to Notion or capture from your phone',
      description: 'Both optional. Nothing to type twice.',
    },
  ] satisfies Step[],
  screenshots: [
    {
      light: '/screenshots/month-light.png',
      dark: '/screenshots/month-dark.png',
      alt: 'The month view: what is left this month, spent and budgeted totals, category bars and the entries table',
    },
    {
      light: '/screenshots/add-light.png',
      dark: '/screenshots/add-dark.png',
      alt: 'The add-expense sheet open over the month view',
    },
  ] satisfies Screenshot[],
  // Relative path: landing and app are expected to share an origin in production (a reverse
  // proxy or the same Fly app serving both). Point this at a full URL via env if that changes.
  signUpUrl: '/register',
};
