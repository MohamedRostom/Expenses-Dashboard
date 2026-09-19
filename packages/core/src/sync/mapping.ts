import { getCurrency, isCurrencyCode } from '../money/currencies.js';

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
 * Amount is a plain number property so we convert to major units using the currency's own
 * exponent (JPY has 0, KWD has 3, most have 2). */
export function toNotionProperties(expense: LocalExpenseLike): Record<string, unknown> {
  const exponent = getCurrency(expense.currencyOriginal).exponent;
  return {
    Expense: { title: [{ text: { content: expense.description } }] },
    Amount: { number: expense.amountOriginal / 10 ** exponent },
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

/** Notion title/rich_text properties are arrays of formatting runs (bold, a link, etc. each
 * start a new segment) — reading only [0] silently truncated anything past the first run. */
function joinPlainText(segments: Array<{ plain_text?: string }> | undefined): string | undefined {
  if (!segments || segments.length === 0) return undefined;
  const joined = segments.map((s) => s.plain_text ?? '').join('');
  return joined || undefined;
}

/** Notion page -> local shape used for diffing. Returns `null` (with a reason) when a
 * required property is missing or unparseable, so the caller can skip it rather than crash. */
export function fromNotionProperties(
  page: NotionPage,
): { ok: true; row: MappedRemote } | { ok: false; reason: string } {
  const p = page.properties;
  const description = joinPlainText(p.Expense?.title);
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
  if (!isCurrencyCode(currency)) return { ok: false, reason: `unknown Currency "${currency}"` };
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
      amountOriginal: Math.round(amount * 10 ** getCurrency(currency).exponent),
      currencyOriginal: currency,
      expenseDate: date,
      categoryName: p.Category?.select?.name ?? null,
      paidWith,
      kind,
      notes: joinPlainText(p.Notes?.rich_text) ?? null,
      addedVia,
      expenseId: joinPlainText(p['Expense ID']?.rich_text) ?? null,
    },
  };
}
