import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ADR-0008 shapes: panels 24px, controls pill, inputs and selects 12px; no legacy sm/md/lg radius.
const rule = (file: string, selector: string) => {
  const css = (readFileSync(`src/${file}`, 'utf8').split('<style')[1] ?? '').replace(
    /\/\*[^]*?\*\//g,
    '',
  );
  return css
    .split('}')
    .filter((chunk) => {
      const [sel = ''] = chunk.split('{');
      return sel.split(',').some((x) => x.trim() === selector);
    })
    .join('}');
};
const legacy = /var\(--radius-(sm|md|lg)\)/;

describe.each([
  ['views/CategoriesView.vue', '.desk-categories-kind', 'var(--radius-field)'],
  ['views/CategoriesView.vue', '.desk-categories-budget-input', 'var(--radius-field)'],
  ['views/CategoriesView.vue', '.desk-review-banner', 'var(--radius-xl)'],
  ['views/CategoriesView.vue', '.desk-review-banner button', 'var(--radius-pill)'],
  ['views/ImportView.vue', '.desk-import-picker-btn', 'var(--radius-pill)'],
  ['views/ImportView.vue', '.desk-import-fix', 'var(--radius-field)'],
  ['components/ExpenseForm.vue', '.desk-expense-form-toggle', 'var(--radius-pill)'],
  ['components/CurrencyPicker.vue', '.desk-input', 'var(--radius-field)'],
  ['components/CurrencyPicker.vue', '.currency-picker-list', 'var(--radius-field)'],
])('%s %s', (file, selector, token) => {
  it(`uses ${token}`, () => {
    const css = rule(file, selector);
    expect(css).toContain(`border-radius: ${token}`);
  });
});

describe('no legacy radius tokens in the data screens', () => {
  it.each([
    'views/YearView.vue',
    'views/CategoriesView.vue',
    'views/CategoryView.vue',
    'views/ImportView.vue',
    'views/BinView.vue',
    'views/AddView.vue',
    'components/ExpenseForm.vue',
    'components/CurrencyPicker.vue',
  ])('%s', (file) => {
    expect(readFileSync(`src/${file}`, 'utf8')).not.toMatch(legacy);
  });
});
