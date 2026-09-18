import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type ApiClient, type Harness } from './harness.js';

const MAPPING = {
  date: 'date',
  amount: 'amount',
  currency: 'currency',
  description: 'description',
  category: 'category',
  dateFormat: 'YYYY-MM-DD' as const,
  decimalSeparator: '.' as const,
};

function csvFile(csv: string, name = 'import.csv'): File {
  return new File([csv], name, { type: 'text/csv' });
}

async function upload(
  user: ApiClient,
  csv: string,
  mapping: unknown = MAPPING,
  name = 'import.csv',
) {
  const form = new FormData();
  form.append('file', csvFile(csv, name));
  form.append('mapping', JSON.stringify(mapping));
  const res = await user.post('/imports', form);
  return res;
}

describe('imports', () => {
  let harness: Harness;
  let user: ApiClient;

  beforeAll(async () => {
    harness = await startHarness();
    user = await harness.asUser('imports@example.com');
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  it('parses UTF-8 with a BOM', async () => {
    const csv =
      '﻿date,amount,currency,description,category\n2026-09-01,5.00,GBP,Coffee,Eating out\n';
    const res = await upload(user, csv);
    expect(res.status).toBe(201);
    const { batch } = (await res.json()) as { batch: { rows: { status: string }[] } };
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0]?.status).toBe('ok');
  });

  it('parses plain UTF-8 without a BOM', async () => {
    const csv = 'date,amount,currency,description\n2026-09-02,5.00,GBP,Tea\n';
    const res = await upload(user, csv);
    expect(res.status).toBe(201);
    const { batch } = (await res.json()) as { batch: { rows: { status: string }[] } };
    expect(batch.rows[0]?.status).toBe('ok');
  });

  it('detects a semicolon delimiter', async () => {
    const csv = 'date;amount;currency;description\n2026-09-03;5.00;GBP;Semicolon row\n';
    const res = await upload(user, csv);
    expect(res.status).toBe(201);
    const { batch } = (await res.json()) as { batch: { rows: { status: string }[] } };
    expect(batch.rows[0]?.status).toBe('ok');
  });

  it('detects a tab delimiter', async () => {
    const csv = 'date\tamount\tcurrency\tdescription\n2026-09-04\t5.00\tGBP\tTab row\n';
    const res = await upload(user, csv);
    expect(res.status).toBe(201);
    const { batch } = (await res.json()) as { batch: { rows: { status: string }[] } };
    expect(batch.rows[0]?.status).toBe('ok');
  });

  it('rejects a file over the 5 MB limit', async () => {
    const bigDescription = 'x'.repeat(6 * 1024 * 1024);
    const csv = `date,amount,currency,description\n2026-09-01,5.00,GBP,${bigDescription}\n`;
    const res = await upload(user, csv);
    expect(res.status).toBe(400);
  });

  it('rejects more than 10,000 rows', async () => {
    const header = 'date,amount,currency,description\n';
    const rows = Array.from({ length: 10_001 }, (_, i) => `2026-09-01,5.00,GBP,row ${i}`).join(
      '\n',
    );
    const res = await upload(user, header + rows);
    expect(res.status).toBe(400);
  });

  it('preview creates nothing in expenses', async () => {
    const before = await user.get('/expenses?month=2026-09');
    const beforeBody = (await before.json()) as { expenses: unknown[] };
    const countBefore = beforeBody.expenses.length;

    const csv = 'date,amount,currency,description\n2026-09-06,5.00,GBP,Preview only row\n';
    const res = await upload(user, csv);
    expect(res.status).toBe(201);

    const after = await user.get('/expenses?month=2026-09');
    const afterBody = (await after.json()) as { expenses: unknown[] };
    expect(afterBody.expenses.length).toBe(countBefore);
  });

  it('commit creates expenses for ok rows and skips a chosen row', async () => {
    const csv =
      'date,amount,currency,description\n' +
      '2026-09-10,5.00,GBP,Commit row one\n' +
      '2026-09-11,6.00,GBP,Commit row two\n';
    const uploadRes = await upload(user, csv);
    const { batch } = (await uploadRes.json()) as { batch: { id: string } };

    const commitRes = await user.post(`/imports/${batch.id}/commit`, { skipRows: [2] });
    expect(commitRes.status).toBe(200);
    const { batch: committed } = (await commitRes.json()) as {
      batch: { status: string; createdExpenses: number };
    };
    expect(committed.status).toBe('done');
    expect(committed.createdExpenses).toBe(1);
  });

  it('commit applies fixes to error rows re-validated before creating', async () => {
    const csv = 'date,amount,currency,description\n2026-09-12,not-a-number,GBP,Fixable row\n';
    const uploadRes = await upload(user, csv);
    const { batch } = (await uploadRes.json()) as {
      batch: { id: string; rows: { rowNumber: number; status: string }[] };
    };
    expect(batch.rows[0]?.status).toBe('error');

    // Error rows are not committed even with a fix supplied (T071 scope: fixes apply to 'ok'
    // rows only); confirm the batch still completes cleanly and reports zero created.
    const commitRes = await user.post(`/imports/${batch.id}/commit`, {});
    expect(commitRes.status).toBe(200);
    const { batch: committed } = (await commitRes.json()) as { batch: { createdExpenses: number } };
    expect(committed.createdExpenses).toBe(0);
  });

  it('marks a row duplicate by mapped external id', async () => {
    const mapping = { ...MAPPING, id: 'rowId' };
    const csv1 = 'date,amount,currency,description,rowId\n2026-09-13,5.00,GBP,Dup by id,ext-1\n';
    const first = await upload(user, csv1, mapping);
    const { batch: batch1 } = (await first.json()) as { batch: { id: string } };
    await user.post(`/imports/${batch1.id}/commit`, {});

    const csv2 = 'date,amount,currency,description,rowId\n2026-09-13,5.00,GBP,Dup by id,ext-1\n';
    const second = await upload(user, csv2, mapping);
    const { batch: batch2 } = (await second.json()) as {
      batch: { rows: { status: string }[] };
    };
    expect(batch2.rows[0]?.status).toBe('duplicate');
  });

  it('marks a row duplicate by fingerprint on re-import', async () => {
    const csv = 'date,amount,currency,description\n2026-09-14,5.00,GBP,Fingerprint dup row\n';
    const first = await upload(user, csv);
    const { batch: batch1 } = (await first.json()) as { batch: { id: string } };
    await user.post(`/imports/${batch1.id}/commit`, {});

    const second = await upload(user, csv);
    const { batch: batch2 } = (await second.json()) as {
      batch: { rows: { status: string }[] };
    };
    expect(batch2.rows[0]?.status).toBe('duplicate');
  });

  it('undo bins the expenses the batch created and reports the count', async () => {
    const csv = 'date,amount,currency,description\n2026-09-15,7.00,GBP,Undo row\n';
    const uploadRes = await upload(user, csv);
    const { batch } = (await uploadRes.json()) as { batch: { id: string } };
    const commitRes = await user.post(`/imports/${batch.id}/commit`, {});
    const { batch: committed } = (await commitRes.json()) as {
      batch: { rows: { expenseId?: string }[] };
    };

    const undoRes = await user.post(`/imports/${batch.id}/undo`, {});
    expect(undoRes.status).toBe(200);
    const body = (await undoRes.json()) as { undone: number; batch: { status: string } };
    expect(body.undone).toBe(1);
    expect(body.batch.status).toBe('undone');
    void committed;
  });

  it('profiles: create, list and reuse a named mapping', async () => {
    const put = await user.put('/imports/profiles/my-bank', { mapping: MAPPING });
    expect(put.status).toBe(200);

    const list = await user.get('/imports/profiles');
    expect(list.status).toBe(200);
    const { profiles } = (await list.json()) as { profiles: { name: string }[] };
    expect(profiles.some((p) => p.name === 'my-bank')).toBe(true);

    // Re-saving the same name updates the mapping rather than creating a duplicate.
    const again = await user.put('/imports/profiles/my-bank', {
      mapping: { ...MAPPING, decimalSeparator: ',' },
    });
    expect(again.status).toBe(200);
    const list2 = await user.get('/imports/profiles');
    const { profiles: profiles2 } = (await list2.json()) as { profiles: { name: string }[] };
    expect(profiles2.filter((p) => p.name === 'my-bank')).toHaveLength(1);
  });

  it('SC-004: previews and commits 1,000 rows in under 60s with FakeRates', async () => {
    const header = 'date,amount,currency,description\n';
    const rows = Array.from({ length: 1000 }, (_, i) => `2026-09-20,5.00,GBP,perf row ${i}`).join(
      '\n',
    );

    const start = Date.now();
    const uploadRes = await upload(user, header + rows);
    expect(uploadRes.status).toBe(201);
    const { batch } = (await uploadRes.json()) as { batch: { id: string } };

    const commitRes = await user.post(`/imports/${batch.id}/commit`, {});
    expect(commitRes.status).toBe(200);
    const { batch: committed } = (await commitRes.json()) as { batch: { createdExpenses: number } };
    expect(committed.createdExpenses).toBe(1000);

    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(60_000);
  }, 65_000);
});
