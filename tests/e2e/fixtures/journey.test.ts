import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { Page } from '@playwright/test';
import { startJourney } from './journey.ts';

function stub() {
  const ev = new EventEmitter();
  const main = {};
  const loc: Record<string, unknown> = {};
  for (const m of ['click', 'tap', 'press', 'fill']) loc[m] = async () => undefined;
  for (const m of ['first', 'last', 'filter', 'locator']) loc[m] = () => loc;
  const page = {
    current: 'http://x.test/a',
    url() {
      return this.current;
    },
    mainFrame: () => main,
    on: (e: string, f: (...a: unknown[]) => void) => ev.on(e, f),
    click: async () => undefined,
    tap: async () => undefined,
    keyboard: { press: async () => undefined, type: async () => undefined },
    locator: () => loc,
    getByRole: () => loc,
    getByLabel: () => loc,
    getByText: () => loc,
    getByPlaceholder: () => loc,
    getByTestId: () => loc,
    goto(u: string, frame: object = main) {
      this.current = u;
      ev.emit('framenavigated', frame);
    },
  };
  return page;
}

test('counts taps, keystrokes and screens', async () => {
  const s = stub();
  const j = startJourney(s as unknown as Page);
  const p = j.page;
  await p.click('a');
  await p.tap('a');
  await p.locator('x').click();
  await p.getByRole('button').first().tap();
  await p.getByLabel('l').filter({ hasText: 'x' }).locator('y').click();
  assert.equal(j.counts().taps, 5);

  await p.keyboard.press('Enter');
  await p.getByTestId('t').press('Tab');
  assert.equal(j.counts().keystrokes, 2);
  await p.getByPlaceholder('p').fill('abc');
  await p.keyboard.type('abc');
  assert.equal(j.counts().keystrokes, 8);

  s.goto('http://x.test/b');
  assert.equal(j.counts().screens, 1);
  s.goto('http://x.test/b');
  s.goto('http://x.test/b?q=1');
  s.goto('http://x.test/b?q=1#h');
  s.goto('http://x.test/c', {});
  assert.equal(j.counts().screens, 1);
  s.goto('http://x.test/c');
  assert.equal(j.counts().screens, 2);
});
