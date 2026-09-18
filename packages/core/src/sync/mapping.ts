/** Field mapping between a local expense row and Notion page properties, per the known
 * layout in CLAUDE.md "External identifiers" (Expense title, Amount number, Currency select,
 * Date, Category select, Paid with select, Kind select, Notes, Added via select, Expense ID
 * text). Pure — no I/O, no Notion SDK types; just plain JSON shapes. */

export interface LocalExpenseLike {
  id: string;
  description: string;
  amountOriginal: number; // minor units
  currencyOriginal: string;
  expenseDate: string; // 'YYYY-MM-DD'
  categoryName: string | null;
  paidWith: string;
  kind: string;
  notes: string | null;
  addedVia: string;
}

/** Minimal shape of a Notion page's `properties` object for the known layout. */
export interface NotionPageProperties {
  Expense?: { title?: Array<{ plain_text?: string }> };
  Amount?: { number?: number | null };
  Currency?: { select?: { name?: string } | null };
  Date?: { date?: { start?: string } | null };
  Category?: { select?: { name?: string } | null };
  'Paid with'?: { select?: { name?: string } | null };
  Kind?: { select?: { name?: string } | null };
  Notes?: { rich_text?: Array<{ plain_text?: string }> };
  'Added via'?: { select?: { name?: string } | null };
  'Expense ID'?: { rich_text?: Array<{ plain_text?: string }> };
}

export interface NotionPage {
  id: string;
  last_edited_time: string;
  archived?: boolean;
  properties: NotionPageProperties;
}

/** Local -> Notion, for a page create/update body. `amountOriginal` is minor units; Notion's
 * Amount is a plain number property so we convert to major units (2dp is enough for v1
 * currencies — a currency with different minor-unit exponents is a known limitation). */
export function toNotionProperties(expense: LocalExpenseLike): Record<string, unknown> {
  return {
    Expense: { title: [{ text: { content: expense.description } }] },
    Amount: { number: expense.amountOriginal / 100 },
    Currency: { select: { name: expense.currencyOriginal } },
    Date: { date: { start: expense.expenseDate } },
    Category: expense.categoryName ? { select: { name: expense.categoryName } } : { select: null },
    'Paid with': { select: { name: expense.paidWith } },
    Kind: { select: { name: expense.kind } },
    Notes: { rich_text: expense.notes ? [{ text: { content: expense.notes } }] : [] },
    'Added via': { select: { name: expense.addedVia } },
    'Expense ID': { rich_text: [{ text: { content: expense.id } }] },
  };
}

export interface MappedRemote {
  pageId: string;
  lastEditedTime: string;
  archived: boolean;
  description: string;
  amountOriginal: number; // minor units
  currencyOriginal: string;
  expenseDate: string;
  categoryName: string | null;
  paidWith: string;
  kind: string;
  notes: string | null;
  addedVia: string;
  expenseId: string | null; // the 'Expense ID' text property, if the app wrote it
}

/** Notion page -> local shape used for diffing. Returns `null` (with a reason) when a
 * required property is missing or unparseable, so the caller can skip it rather than crash. */
export function fromNotionProperties(
  page: NotionPage,
): { ok: true; row: MappedRemote } | { ok: false; reason: string } {
  const p = page.properties;
  const description = p.Expense?.title?.[0]?.plain_text;
  const amount = p.Amount?.number;
  const currency = p.Currency?.select?.name;
  const date = p.Date?.date?.start;
  const paidWith = p['Paid with']?.select?.name;
  const kind = p.Kind?.select?.name;
  const addedVia = p['Added via']?.select?.name;

  if (!description) return { ok: false, reason: 'missing Expense title' };
  if (amount === undefined || amount === null || Number.isNaN(amount)) {
    return { ok: false, reason: 'missing or invalid Amount' };
  }
  if (!currency) return { ok: false, reason: 'missing Currency' };
  if (!date) return { ok: false, reason: 'missing Date' };
  if (!paidWith) return { ok: false, reason: 'missing Paid with' };
  if (!kind) return { ok: false, reason: 'missing Kind' };
  if (!addedVia) return { ok: false, reason: 'missing Added via' };

  return {
    ok: true,
    row: {
      pageId: page.id,
      lastEditedTime: page.last_edited_time,
      archived: page.archived ?? false,
      description,
      amountOriginal: Math.round(amount * 100),
      currencyOriginal: currency,
      expenseDate: date,
      categoryName: p.Category?.select?.name ?? null,
      paidWith,
      kind,
      notes: p.Notes?.rich_text?.[0]?.plain_text ?? null,
      addedVia,
      expenseId: p['Expense ID']?.rich_text?.[0]?.plain_text ?? null,
    },
  };
}
