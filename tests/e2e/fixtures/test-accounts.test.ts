// Run: pnpm --filter @desk/e2e test:unit (node:test via tsx; no browser, no stack).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTestAccounts } from './test-accounts.js';

const dir = mkdtempSync(join(tmpdir(), 'desk-accounts-'));
const file = (name: string, body: string) => {
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
};

test('a missing file means no accounts', () => {
  assert.deepEqual(loadTestAccounts(join(dir, 'nope.yaml')), { standards: [] });
});

test('an empty file means no accounts', () => {
  assert.deepEqual(loadTestAccounts(file('empty.yaml', '')), { standards: [] });
});

test('the untouched example file (blank placeholders) means no accounts', () => {
  const example = join(import.meta.dirname, '..', 'test-accounts.example.yaml');
  assert.deepEqual(loadTestAccounts(example), { standards: [] });
});

test('filled entries are returned; incomplete ones are dropped', () => {
  const p = file(
    'partial.yaml',
    [
      'google:',
      '  email: e2e@example.com',
      '  refreshToken: rt-google',
      'microsoft:',
      '  email: e2e@outlook.example',
      "  refreshToken: ''",
      'standards:',
      '  - preset: fastmail',
      '    address: e2e@fastmail.example',
      '    appPassword: app-pw',
      '  - preset: yahoo',
      "    address: ''",
      '    appPassword: x',
      '  - address: self@host.example',
      '    appPassword: pw2',
      '    imapHost: imap.host.example',
      '    imapPort: 993',
    ].join('\n'),
  );
  assert.deepEqual(loadTestAccounts(p), {
    google: { email: 'e2e@example.com', refreshToken: 'rt-google' },
    standards: [
      { preset: 'fastmail', address: 'e2e@fastmail.example', appPassword: 'app-pw' },
      {
        address: 'self@host.example',
        appPassword: 'pw2',
        imapHost: 'imap.host.example',
        imapPort: 993,
      },
    ],
  });
});

test('a non-mapping document is an error, not a silent skip', () => {
  assert.throws(() => loadTestAccounts(file('list.yaml', '- a\n- b\n')), /expected a mapping/);
});

test('E2E_TEST_ACCOUNTS_FILE overrides the default path', () => {
  const p = file('env.yaml', 'microsoft:\n  email: m@example.com\n  refreshToken: rt\n');
  process.env['E2E_TEST_ACCOUNTS_FILE'] = p;
  try {
    assert.deepEqual(loadTestAccounts().microsoft, { email: 'm@example.com', refreshToken: 'rt' });
  } finally {
    delete process.env['E2E_TEST_ACCOUNTS_FILE'];
  }
});
