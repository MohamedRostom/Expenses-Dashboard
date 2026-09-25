import { z } from 'zod';

export const DateFormat = z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']);
export type DateFormatT = z.infer<typeof DateFormat>;

export const DecimalSeparator = z.enum(['.', ',']);
export type DecimalSeparatorT = z.infer<typeof DecimalSeparator>;

export const ColumnMapping = z.object({
  date: z.string(),
  amount: z.string(),
  currency: z.string(),
  description: z.string(),
  category: z.string().optional(),
  id: z.string().optional(),
  dateFormat: DateFormat,
  decimalSeparator: DecimalSeparator,
});
export type ColumnMappingT = z.infer<typeof ColumnMapping>;

/** GET /imports/profiles response */
export const ImportProfileResponse = z.object({
  id: z.string(),
  name: z.string(),
  mapping: ColumnMapping,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ImportProfileResponseT = z.infer<typeof ImportProfileResponse>;

export const ListImportProfilesResponse = z.object({
  profiles: z.array(ImportProfileResponse),
});
export type ListImportProfilesResponseT = z.infer<typeof ListImportProfilesResponse>;

/** PUT /imports/profiles/:name */
export const SaveImportProfileRequest = z.object({ mapping: ColumnMapping });
export type SaveImportProfileRequestT = z.infer<typeof SaveImportProfileRequest>;

export const ImportRowStatus = z.enum(['ok', 'duplicate', 'error', 'skipped']);
export type ImportRowStatusT = z.infer<typeof ImportRowStatus>;

export const ImportRowResponse = z.object({
  rowNumber: z.number().int(),
  parsed: z
    .object({
      date: z.string(),
      amountMinor: z.number().int(),
      currency: z.string(),
      description: z.string(),
      categoryHint: z.string().optional(),
      externalId: z.string().optional(),
    })
    .nullable(),
  status: ImportRowStatus,
  error: z.string().nullable(),
});
export type ImportRowResponseT = z.infer<typeof ImportRowResponse>;

export const ImportBatchStatus = z.enum(['previewing', 'importing', 'done', 'undone', 'failed']);
export type ImportBatchStatusT = z.infer<typeof ImportBatchStatus>;

export const ImportBatchResponse = z.object({
  id: z.string(),
  fileName: z.string(),
  rowCount: z.number().int(),
  status: ImportBatchStatus,
  createdExpenses: z.number().int(),
  duplicates: z.number().int(),
  errors: z.number().int(),
  rows: z.array(ImportRowResponse).optional(),
});
export type ImportBatchResponseT = z.infer<typeof ImportBatchResponse>;

export const CreateImportResponse = z.object({ batch: ImportBatchResponse });
export type CreateImportResponseT = z.infer<typeof CreateImportResponse>;

/** POST /imports/:id/commit */
export const CommitImportRequest = z.object({
  skipRows: z.array(z.number().int()).optional(),
  fixes: z
    .record(
      z.string(),
      z.object({
        date: z.string().optional(),
        amountMinor: z.number().int().optional(),
        currency: z.string().optional(),
        description: z.string().optional(),
        categoryId: z.string().uuid().nullable().optional(),
      }),
    )
    .optional(),
});
export type CommitImportRequestT = z.infer<typeof CommitImportRequest>;

export const CommitImportResponse = z.object({ batch: ImportBatchResponse });
export type CommitImportResponseT = z.infer<typeof CommitImportResponse>;

export const UndoImportResponse = z.object({
  batch: ImportBatchResponse,
  undone: z.number().int(),
});
export type UndoImportResponseT = z.infer<typeof UndoImportResponse>;
