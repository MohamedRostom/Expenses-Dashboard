# Contract: Generic Capture Address

The only automatic capture path in v1 (ADR-0003). Intended for phone automations (iOS
Shortcuts, MacroDroid, NFC tags) and any tool that can send one HTTPS request.

## Endpoint

`POST https://<host>/hooks/generic/<token>`

- `<token>`: 43-character base64url secret shown once when created or rotated in Settings.
  It is the only credential; no session or CSRF token is used.
- Content type: `application/json`. Body limit 4 KB.

## Request body

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `amount` | string or number | yes | Decimal in the currency's major units, e.g. `"12.50"` or `12.5`; parsed with the currency's exponent; negative means refund |
| `currency` | string | yes | ISO 4217 code, case-insensitive |
| `description` | string | yes | 1 to 200 characters |
| `date` | string | no | `YYYY-MM-DD`; defaults to today in the user's default time zone setting (UTC if unset) |
| `category` | string | no | Free label mapped through the user's capture mapping; unmapped goes to "Other" |
| `paidWith` | string | no | `card`, `cash`, `bank_transfer`, `other`; default `other` |
| `id` | string | no | Sender-supplied idempotency key, 1 to 128 characters |

Without `id`, the receipt key is the SHA-256 of `amount|currency|description|date|minute`,
which makes an accidental double-send within the same minute a duplicate but a genuine repeat
purchase a minute later a new expense.

## Responses

| Status | Body | When |
|--------|------|------|
| 201 | `{ expenseId, duplicate: false }` | Expense created; `addedVia = phone` |
| 200 | `{ expenseId, duplicate: true }` | Same receipt key seen before; nothing created |
| 400 | `{ error: { code: 'validation_failed', details } }` | Body invalid |
| 404 | `{ error: { code: 'not_found' } }` | Unknown or revoked token (same as a missing route, to avoid probing) |
| 429 | `{ error: { code: 'rate_limited' } }` | More than 60 requests per minute for the token |

## Behaviour

- Conversion to the user's default currency happens exactly as for an app-entered expense
  (rate for `date`, fallback to the previous published rate, `rate_date` recorded).
- Rotation revokes the previous token immediately; requests to it answer 404 and are counted in
  the audit log so the user can see attempts.
- The endpoint never reveals user details; the response contains only the expense id.

## Example (iOS Shortcut "Get Contents of URL")

```json
POST /hooks/generic/<token>
{ "amount": "4.20", "currency": "GBP", "description": "Coffee", "category": "eating out", "id": "shortcut-2026-09-16T08:12:03Z" }
```
