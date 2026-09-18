import Papa from 'papaparse';
import { and, eq, isNull } from 'drizzle-orm';
import {
  importProfiles,
  importBatches,
  importRows,
  expenses as expensesTable,
  type Db,
} from '@desk/db';
import { fingerprint, parseRow, type ColumnMapping, type ParsedRow } from '@desk/core';
import type {
  ImportBatchResponseT,
  ImportProfileResponseT,
  CommitImportRequestT,
} from '@desk/contracts';
import { ApiError } from '../lib/api-error.js';
import type { ExpensesService } from './expenses.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;

type BatchRow = typeof importBatches.$inferSelect;
type ImportRowRow = typeof importRows.$inferSelect;

function batchToResponse(batch: BatchRow, rows?: ImportRowRow[]): ImportBatchResponseT {
  return {
    id: batch.id,
    fileName: batch.fileName,
    rowCount: batch.rowCount,
    status: batch.status as ImportBatchResponseT['status'],
    createdExpenses: batch.createdExpenses,
    duplicates: batch.duplicates,
    errors: batch.errors,
    rows: rows?.map((r) => ({
      rowNumber: r.rowNumber,
      parsed: (r.parsed as ParsedRow | null) ?? null,
      status: r.status as 'ok' | 'duplicate' | 'error' | 'skipped',
      error: r.error,
    })),
  };
}

function profileToResponse(row: typeof importProfiles.$inferSelect): ImportProfileResponseT {
  return {
    id: row.id,
    name: row.name,
    mapping: row.mapping as ColumnMapping,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Strips a UTF-8 BOM and detects the delimiter (comma/semicolon/tab) papaparse's own
 * auto-detect already handles well, but we pin the candidate set per research.md R12. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function createImportsService(db: Db, expensesService: ExpensesService) {
  async function listProfiles(userId: string): Promise<ImportProfileResponseT[]> {
    const rows = await db.select().from(importProfiles).where(eq(importProfiles.userId, userId));
    return rows.map(profileToResponse);
  }

  async function saveProfile(
    userId: string,
    name: string,
    mapping: ColumnMapping,
  ): Promise<ImportProfileResponseT> {
    const [existing] = await db
      .select()
      .from(importProfiles)
      .where(and(eq(importProfiles.userId, userId), eq(importProfiles.name, name)))
      .limit(1);
    if (existing) {
      const [row] = await db
        .update(importProfiles)
        .set({ mapping, updatedAt: new Date() })
        .where(eq(importProfiles.id, existing.id))
        .returning();
      return profileToResponse(row as typeof importProfiles.$inferSelect);
    }
    const [row] = await db.insert(importProfiles).values({ userId, name, mapping }).returning();
    return profileToResponse(row as typeof importProfiles.$inferSelect);
  }

  async function findBatch(userId: string, batchId: string): Promise<BatchRow> {
    const [row] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1);
    if (!row || row.userId !== userId) {
      throw new ApiError('not_found', 'Import batch not found', 404);
    }
    return row;
  }

  /** Computes fingerprints for the user's existing (non-deleted) expenses, for duplicate
   * detection against new rows — not stored on `expenses` itself (data-model.md intent). */
  async function existingFingerprints(userId: string): Promise<{ byFingerprint: Set<string> }> {
    const rows = await db
      .select()
      .from(expensesTable)
      .where(and(eq(expensesTable.userId, userId), isNull(expensesTable.deletedAt)));
    const byFingerprint = new Set<string>();
    for (const row of rows) {
      byFingerprint.add(
        await fingerprint(
          row.expenseDate,
          row.amountOriginal,
          row.currencyOriginal,
          row.description,
        ),
      );
    }
    return { byFingerprint };
  }

  /** Parses `fileText` with `mapping`, previews every row's status into import_rows and creates
   * the batch in status 'previewing'. Creates nothing in `expenses`. */
  async function preview(
    userId: string,
    fileName: string,
    fileBytes: number,
    fileText: string,
    profileId: string | null,
    mapping: ColumnMapping,
  ): Promise<ImportBatchResponseT> {
    if (fileBytes > MAX_FILE_BYTES) {
      throw new ApiError('validation_failed', 'File exceeds the 5 MB import limit', 400);
    }

    const parsed = Papa.parse<Record<string, string>>(stripBom(fileText), {
      header: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', ';', '\t'],
    });
    const rawRows = parsed.data;
    if (rawRows.length > MAX_ROWS) {
      throw new ApiError('validation_failed', `Import exceeds the ${MAX_ROWS}-row limit`, 400);
    }

    const { byFingerprint } = await existingFingerprints(userId);
    const existingExternalIds = mapping.id
      ? new Set(
          (
            await db
              .select({ id: expensesTable.id })
              .from(expensesTable)
              .where(eq(expensesTable.userId, userId))
          ).map((r) => r.id),
        )
      : new Set<string>();

    let duplicates = 0;
    let errors = 0;
    const toInsert: (typeof importRows.$inferInsert)[] = [];

    const [batch] = await db
      .insert(importBatches)
      .values({
        userId,
        profileId,
        fileName,
        rowCount: rawRows.length,
        status: 'previewing',
      })
      .returning();
    if (!batch) throw new Error('preview: batch insert returned nothing');

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i] as Record<string, string>;
      const rowNumber = i + 1;
      const result = parseRow(raw, mapping);
      if (!result.ok) {
        errors++;
        toInsert.push({
          batchId: batch.id,
          userId,
          rowNumber,
          raw,
          parsed: null,
          fingerprint: null,
          externalId: null,
          status: 'error',
          error: result.error,
        });
        continue;
      }

      const fp = await fingerprint(
        result.row.date,
        result.row.amountMinor,
        result.row.currency,
        result.row.description,
      );
      // A mapped id column takes precedence over the fingerprint (research.md R12).
      const isDuplicate =
        (result.row.externalId !== undefined && existingExternalIds.has(result.row.externalId)) ||
        byFingerprint.has(fp);

      if (isDuplicate) duplicates++;

      toInsert.push({
        batchId: batch.id,
        userId,
        rowNumber,
        raw,
        parsed: result.row,
        fingerprint: fp,
        externalId: result.row.externalId ?? null,
        status: isDuplicate ? 'duplicate' : 'ok',
        error: null,
      });
    }

    if (toInsert.length > 0) await db.insert(importRows).values(toInsert);
    const [updated] = await db
      .update(importBatches)
      .set({ duplicates, errors })
      .where(eq(importBatches.id, batch.id))
      .returning();

    const rows = await db.select().from(importRows).where(eq(importRows.batchId, batch.id));
    return batchToResponse(updated as BatchRow, rows);
  }

  /** Creates real expenses for 'ok' rows (applying any client-sent fixes first), skips
   * 'duplicate'/'error'/user-skipped rows, and marks the batch 'done'. */
  async function commit(
    userId: string,
    defaultCurrency: string,
    batchId: string,
    input: CommitImportRequestT,
  ): Promise<ImportBatchResponseT> {
    const batch = await findBatch(userId, batchId);
    if (batch.status !== 'previewing') {
      throw new ApiError('conflict', `Batch is ${batch.status}, cannot commit`, 409);
    }

    const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
    const skip = new Set(input.skipRows ?? []);
    let created = 0;

    for (const row of rows) {
      if (skip.has(row.rowNumber)) {
        await db.update(importRows).set({ status: 'skipped' }).where(eq(importRows.id, row.id));
        continue;
      }
      if (row.status !== 'ok') continue;

      const parsed = row.parsed as ParsedRow;
      const fix = input.fixes?.[String(row.rowNumber)];
      const date = fix?.date ?? parsed.date;
      const amountMinor = fix?.amountMinor ?? parsed.amountMinor;
      const currency = fix?.currency ?? parsed.currency;
      const description = fix?.description ?? parsed.description;

      const { expense } = await expensesService.create(userId, defaultCurrency, {
        description,
        amount: { minor: amountMinor, currency },
        date,
        categoryId: fix?.categoryId ?? null,
        paidWith: 'other',
        kind: 'variable',
      });
      // addedVia/importBatchId aren't settable through CreateExpenseRequest — stamp them directly.
      await db
        .update(expensesTable)
        .set({ addedVia: 'import', importBatchId: batchId })
        .where(eq(expensesTable.id, expense.id));
      await db.update(importRows).set({ expenseId: expense.id }).where(eq(importRows.id, row.id));
      created++;
    }

    const [updated] = await db
      .update(importBatches)
      .set({ status: 'done', createdExpenses: created, finishedAt: new Date() })
      .where(eq(importBatches.id, batchId))
      .returning();

    const finalRows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
    return batchToResponse(updated as BatchRow, finalRows);
  }

  /** Bins every expense created by this batch and marks it 'undone'. */
  async function undo(
    userId: string,
    batchId: string,
  ): Promise<{ batch: ImportBatchResponseT; undone: number }> {
    const batch = await findBatch(userId, batchId);
    if (batch.status !== 'done') {
      throw new ApiError('conflict', `Batch is ${batch.status}, nothing to undo`, 409);
    }

    const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
    let undone = 0;
    const now = new Date();
    for (const row of rows) {
      if (!row.expenseId) continue;
      await db
        .update(expensesTable)
        .set({ deletedAt: now })
        .where(and(eq(expensesTable.id, row.expenseId), eq(expensesTable.userId, userId)));
      undone++;
    }

    const [updated] = await db
      .update(importBatches)
      .set({ status: 'undone', finishedAt: now })
      .where(eq(importBatches.id, batchId))
      .returning();

    return { batch: batchToResponse(updated as BatchRow), undone };
  }

  return { listProfiles, saveProfile, preview, commit, undo, findBatch };
}

export type ImportsService = ReturnType<typeof createImportsService>;
