import { describe, expect, it } from 'vitest';
import { matchShortcut, isEditableTarget, SHORTCUTS } from './useShortcuts.js';

describe('matchShortcut', () => {
  it('maps n/[/] to their handlers', () => {
    expect(matchShortcut('n')).toBe('onNew');
    expect(matchShortcut('[')).toBe('onPrevMonth');
    expect(matchShortcut(']')).toBe('onNextMonth');
  });

  it('maps ? to onHelp and lists every shortcut for the help dialog', () => {
    expect(matchShortcut('?')).toBe('onHelp');
    expect(SHORTCUTS.map((s) => s.key)).toEqual(['n', '[', ']', '?']);
  });

  it('returns null for other keys', () => {
    expect(matchShortcut('a')).toBeNull();
    expect(matchShortcut('Enter')).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('is true for input/textarea/select and contenteditable', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    const div = document.createElement('div');
    div.contentEditable = 'true';
    expect(isEditableTarget(div)).toBe(true);
  });

  it('is false for a plain element or null', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
