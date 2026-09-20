// Generates packages/contracts/openapi.json from the zod schemas in src/index.ts.
//
// Approach: zod 4 ships z.toJSONSchema() natively (no extra dependency — rung 5 of the
// ladder: an already-installed dependency solves it), and OpenAPI 3.1's `components.schemas`
// is JSON Schema (2020-12) verbatim, so every exported schema becomes a component schema
// automatically with no per-file `.openapi()` annotation work.
//
// `paths` is hand-written from specs/001-phased-product-baseline/contracts/api.md and kept
// deliberately terse (method + path + summary + $ref to the matching schema) rather than a
// full per-parameter OpenAPI path spec — writing the full parameter/response detail for ~50
// routes by hand is far more code than this file, and none of it can be derived from the zod
// schemas (route/method pairing isn't encoded there). Route list is a follow-up if per-route
// parameter docs are ever needed beyond api.md.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import prettier from 'prettier';
import * as contracts from '../src/index.js';

const schemas: Record<string, object> = {};
for (const [name, value] of Object.entries(contracts)) {
  if (value instanceof z.ZodType) {
    schemas[name] = z.toJSONSchema(value, { target: 'draft-2020-12' });
  }
}

// method, path, summary, request schema name (or null), response schema name (or null)
const routes: [string, string, string, string | null, string | null][] = [
  ['GET', '/healthz', 'Liveness/readiness', null, 'HealthResponse'],
  ['POST', '/auth/register', 'Register with email + password', 'RegisterRequest', null],
  ['POST', '/auth/verify', 'Verify email token', 'VerifyRequest', 'VerifyResponse'],
  ['POST', '/auth/login', 'Log in', 'LoginRequest', 'LoginResponse'],
  ['POST', '/auth/logout', 'Log out current session', null, null],
  ['GET', '/auth/google/start', 'Begin Google OIDC', null, null],
  ['GET', '/auth/google/callback', 'Google OIDC callback', null, null],
  ['POST', '/auth/password/forgot', 'Request password reset', 'ForgotPasswordRequest', null],
  ['POST', '/auth/password/reset', 'Reset password', 'ResetPasswordRequest', null],
  ['GET', '/me', 'Current user', null, 'MeResponse'],
  ['PATCH', '/me', 'Update profile/settings', 'PatchMeRequest', 'PatchMeResponse'],
  ['POST', '/me/email', 'Request email change', 'ChangeEmailRequest', null],
  [
    'POST',
    '/me/email/confirm',
    'Confirm email change',
    'ConfirmEmailRequest',
    'ConfirmEmailResponse',
  ],
  ['DELETE', '/me', 'Delete account', 'DeleteMeRequest', null],
  ['GET', '/me/sessions', 'List sessions', null, 'SessionsResponse'],
  ['GET', '/me/export', 'Export account data', null, 'ExportDocument'],
  ['GET', '/currencies', 'List ISO 4217 currencies', null, 'CurrenciesResponse'],
  ['GET', '/jobs/:id', 'Background job status', null, 'JobResponse'],
  ['GET', '/flags', 'Resolved feature flags', null, 'FlagsResponse'],
  ['GET', '/expenses', 'List expenses', 'ListExpensesQuery', 'ListExpensesResponse'],
  [
    'POST',
    '/expenses',
    'Create expense (idempotent by client id)',
    'CreateExpenseRequest',
    'ExpenseResponse',
  ],
  ['PATCH', '/expenses/:id', 'Update expense', 'PatchExpenseRequest', 'ExpenseResponse'],
  ['DELETE', '/expenses/:id', 'Soft-delete expense', null, null],
  ['GET', '/summary/month', 'Month summary', null, 'MonthSummary'],
  ['GET', '/summary/year', 'Year summary', null, 'YearSummary'],
  ['GET', '/summary/category/:id', 'Category drilldown', null, 'CategoryDrilldown'],
  ['GET', '/summary/forecast', 'Budget forecast', null, 'ForecastSummary'],
  ['GET', '/summary/compare', 'Month comparison', null, 'CompareSummary'],
  ['GET', '/categories', 'List categories', null, 'ListCategoriesResponse'],
  ['POST', '/categories', 'Create category', 'CreateCategoryRequest', 'CategoryResponse'],
  ['PATCH', '/categories/:id', 'Update category', 'PatchCategoryRequest', 'CategoryResponse'],
  ['GET', '/imports/profiles', 'List import profiles', null, 'ListImportProfilesResponse'],
  [
    'PUT',
    '/imports/profiles/:name',
    'Save import profile',
    'SaveImportProfileRequest',
    'ImportProfileResponse',
  ],
  ['POST', '/imports', 'Upload + preview import batch', null, 'CreateImportResponse'],
  [
    'POST',
    '/imports/:id/commit',
    'Commit import batch',
    'CommitImportRequest',
    'CommitImportResponse',
  ],
  ['POST', '/imports/:id/undo', 'Undo import batch', null, 'UndoImportResponse'],
  ['GET', '/rates', 'Preview an FX rate', 'RatePreviewQuery', 'RatePreviewResponse'],
  ['GET', '/notion/connection', 'Notion connection status', null, 'NotionConnectionResponse'],
  [
    'PUT',
    '/notion/connection',
    'Connect/reconfigure Notion',
    'SetNotionConnectionRequest',
    'NotionConnectionResponse',
  ],
  ['DELETE', '/notion/connection', 'Disconnect Notion', null, null],
  [
    'GET',
    '/notion/databases',
    'List candidate Notion databases',
    null,
    'ListNotionDatabasesResponse',
  ],
  ['POST', '/notion/sync', 'Sync now', null, 'SyncNotionResponse'],
  ['GET', '/expenses/:id/versions', 'Expense change history', null, 'ListExpenseVersionsResponse'],
  ['GET', '/capture/tokens', 'List capture tokens', null, 'ListCaptureTokensResponse'],
  [
    'POST',
    '/capture/tokens/:label/rotate',
    'Rotate capture token',
    null,
    'RotateCaptureTokenResponse',
  ],
  ['GET', '/capture/mapping', 'Capture category mapping', null, 'CaptureMappingResponse'],
  [
    'PUT',
    '/capture/mapping',
    'Set capture category mapping',
    'SetCaptureMappingRequest',
    'CaptureMappingResponse',
  ],
  [
    'POST',
    '/hooks/generic/:token',
    'Generic phone-automation webhook (unauthenticated)',
    'GenericWebhookBody',
    'GenericWebhookResponse',
  ],
];

const paths: Record<string, Record<string, object>> = {};
for (const [method, path, summary, reqSchema, resSchema] of routes) {
  const openapiPath = path.replace(/:([a-zA-Z]+)/g, '{$1}');
  paths[openapiPath] ??= {};
  paths[openapiPath][method.toLowerCase()] = {
    summary,
    ...(reqSchema && schemas[reqSchema]
      ? {
          requestBody: {
            content: {
              'application/json': { schema: { $ref: `#/components/schemas/${reqSchema}` } },
            },
          },
        }
      : {}),
    responses: {
      ...(resSchema && schemas[resSchema]
        ? {
            '200': {
              description: summary,
              content: {
                'application/json': { schema: { $ref: `#/components/schemas/${resSchema}` } },
              },
            },
          }
        : { default: { description: 'See specs/001-phased-product-baseline/contracts/api.md' } }),
    },
  };
}

const doc = {
  openapi: '3.1.0',
  info: {
    title: 'Desk API',
    version: '0.0.0',
    description:
      'Generated from packages/contracts/src via scripts/openapi.ts. Route list is hand-mapped ' +
      'from specs/001-phased-product-baseline/contracts/api.md; schemas are auto-converted from zod.',
  },
  paths,
  components: { schemas },
};

const outFile = fileURLToPath(new URL('../openapi.json', import.meta.url));
// Prettier-formatted (matches `pnpm format`/`format:check` across the repo, and CI's lint job
// diffs this file against a fresh regeneration — plain JSON.stringify's one-array-item-per-line
// output never matched the committed file, so that diff check always failed).
// resolveConfig is required here: prettier.format() does NOT read .prettierrc on its own — passing
// only `filepath` infers the parser but silently falls back to Prettier's own defaults (printWidth
// 80) instead of this repo's printWidth 100, which disagreed with the real `prettier --write` that
// lint-staged runs on commit.
const config = (await prettier.resolveConfig(outFile)) ?? {};
const formatted = await prettier.format(JSON.stringify(doc, null, 2), {
  ...config,
  filepath: outFile,
});
writeFileSync(outFile, formatted);
console.log(
  `wrote ${outFile} (${Object.keys(schemas).length} schemas, ${Object.keys(paths).length} paths)`,
);
