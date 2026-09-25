/** The property layout the Notion connector expects/creates, per CLAUDE.md "External
 * identifiers" (Rostom's "💷 Expenses" database schema, FR-014). */
export const KNOWN_LAYOUT: Record<string, unknown> = {
  Expense: { title: {} },
  Amount: { number: { format: 'number' } },
  Currency: { select: {} },
  Date: { date: {} },
  Category: { select: {} },
  'Paid with': {
    select: {
      options: [{ name: 'Card' }, { name: 'Cash' }, { name: 'Bank transfer' }, { name: 'Other' }],
    },
  },
  Kind: { select: { options: [{ name: 'Fixed' }, { name: 'Variable' }, { name: 'One-off' }] } },
  Notes: { rich_text: {} },
  'Added via': {
    select: { options: [{ name: 'Dashboard' }, { name: 'Notion' }, { name: 'Phone' }] },
  },
  'Expense ID': { rich_text: {} },
};

export const KNOWN_LAYOUT_PROPERTY_NAMES = Object.keys(KNOWN_LAYOUT);
