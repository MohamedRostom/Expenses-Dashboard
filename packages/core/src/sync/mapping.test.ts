import { describe, expect, it } from 'vitest';
import { fromNotionProperties, toNotionProperties, type NotionPage } from './mapping.js';

describe('toNotionProperties', () => {
  it('maps a local expense to the known Notion layout, minor units -> major units', () => {
    const props = toNotionProperties({
      id: 'exp-1',
      description: 'Coffee',
      amountOriginal: 350,
      currencyOriginal: 'GBP',
      expenseDate: '2026-09-10',
      categoryName: 'Eating out',
      paidWith: 'Card',
      kind: 'Variable',
      notes: null,
      addedVia: 'Dashboard',
    });

    expect(props.Amount).toEqual({ number: 3.5 });
    expect(props.Currency).toEqual({ select: { name: 'GBP' } });
    expect(props['Expense ID']).toEqual({ rich_text: [{ text: { content: 'exp-1' } }] });
  });

  it('a null category maps to a cleared select', () => {
    const props = toNotionProperties({
      id: 'exp-2',
      description: 'Misc',
      amountOriginal: 100,
      currencyOriginal: 'GBP',
      expenseDate: '2026-09-10',
      categoryName: null,
      paidWith: 'Cash',
      kind: 'One-off',
      notes: 'a note',
      addedVia: 'Phone',
    });

    expect(props.Category).toEqual({ select: null });
    expect(props.Notes).toEqual({ rich_text: [{ text: { content: 'a note' } }] });
  });
});

function page(overrides: Partial<NotionPage['properties']> = {}): NotionPage {
  return {
    id: 'page-1',
    last_edited_time: '2026-09-10T10:00:00.000Z',
    archived: false,
    properties: {
      Expense: { title: [{ plain_text: 'Coffee' }] },
      Amount: { number: 3.5 },
      Currency: { select: { name: 'GBP' } },
      Date: { date: { start: '2026-09-10' } },
      Category: { select: { name: 'Eating out' } },
      'Paid with': { select: { name: 'Card' } },
      Kind: { select: { name: 'Variable' } },
      Notes: { rich_text: [] },
      'Added via': { select: { name: 'Notion' } },
      'Expense ID': { rich_text: [] },
      ...overrides,
    },
  };
}

describe('fromNotionProperties', () => {
  it('maps a valid page to a MappedRemote row', () => {
    const result = fromNotionProperties(page());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.amountOriginal).toBe(350);
      expect(result.row.currencyOriginal).toBe('GBP');
      expect(result.row.categoryName).toBe('Eating out');
    }
  });

  it.each([
    ['Expense', 'missing Expense title'],
    ['Amount', 'missing or invalid Amount'],
    ['Currency', 'missing Currency'],
    ['Date', 'missing Date'],
    ['Paid with', 'missing Paid with'],
    ['Kind', 'missing Kind'],
    ['Added via', 'missing Added via'],
  ] as const)('a missing %s property is rejected with a reason', (propName, expectedReason) => {
    const result = fromNotionProperties(page({ [propName]: undefined }));
    expect(result).toEqual({ ok: false, reason: expectedReason });
  });
});
