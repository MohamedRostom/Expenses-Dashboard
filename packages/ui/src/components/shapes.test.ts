// ADR-0008 shapes: pills for buttons, chips, segmented controls and tabs; 12px fields; 24px dialogs
// and sheets on their free edges. Read from the sources so a block cannot drift back to ADR-0007's 2px.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const style = (block: string) => {
  const src = readFileSync(fileURLToPath(new URL(`./${block}.vue`, import.meta.url)), 'utf-8');
  return src.slice(src.indexOf('<style'));
};
const rule = (block: string, selector: string) => {
  const css = style(block);
  const at = css.indexOf(`${selector} {`);
  expect(at, `${block} ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

describe('block shapes (ADR-0008)', () => {
  it.each([
    ['Button', '.desk-btn', '--radius-pill'],
    ['Tabs', '.desk-tab', '--radius-pill'],
    ['ThemeToggle', '.desk-theme', '--radius-pill'],
    ['ThemeToggle', '.desk-theme-option', '--radius-pill'],
    ['MenuButton', '.desk-menu-trigger', '--radius-pill'],
    ['Input', '.desk-input', '--radius-field'],
    ['Select', '.desk-select', '--radius-field'],
    ['MenuButton', '.desk-menu-list', '--radius-field'],
    ['Dialog', '.desk-dialog', '--radius-xl'],
  ])('%s %s uses %s', (block, selector, token) => {
    expect(rule(block, selector)).toContain(`border-radius: var(${token}`);
  });

  it('dialogs and sheets round their free edges at 24px, with no 8px left', () => {
    const css = style('Dialog');
    expect(css).not.toContain('var(--radius-lg)');
    for (const sel of ['.desk-dialog--bottom', '.desk-dialog--side', '.desk-dialog--sheet'])
      expect(rule('Dialog', sel)).toContain('var(--radius-xl)');
  });

  it('tabs have no underline rail any more: the selected tab is a filled pill', () => {
    expect(rule('Tabs', '.desk-tablist')).not.toContain('border-bottom');
    expect(rule('Tabs', '.desk-tab.selected')).toContain('background');
  });

  it('the departure tile fills with the accent and wins over every opaque fallback', () => {
    const filled = rule('Tile', '.surface.desk-tile-block--filled');
    expect(filled).toContain('background: var(--color-accent)');
    expect(filled).toContain('var(--color-accent-fg)');
    expect(filled).toContain('backdrop-filter: none');
  });
});
