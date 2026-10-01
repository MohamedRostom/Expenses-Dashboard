# Panels Testing Setup Guide

Complete step-by-step guide to enable Google/Microsoft mail and calendar panels for testing in preview, staging, and local development.

---

## Overview

Panels require **separate OAuth credentials** from sign-in:
- **Sign-in**: `GOOGLE_CLIENT_ID` (scopes: `openid email profile`)
- **Panels**: `GOOGLE_PANELS_CLIENT_ID` (scopes: `gmail.readonly`, `calendar.readonly`)

---

## 1. Google Cloud Console Setup

### 1.1 Create Panels OAuth Client

1. Go to **Google Cloud Console → APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. **Application type**: Web application
4. **Name**: "Desk Panels [Environment]" (e.g., "Desk Panels Preview")
5. **Authorized JavaScript origins**:
   ```
   https://ros-desk-staging.fly.dev
   https://ros-desk-production.fly.dev
   https://ros-desk-pr-<PR_NUMBER>.fly.dev
   http://localhost:5173
   ```
6. **Authorized redirect URIs** (note: `/connections/`, not `/auth/`):
   ```
   https://ros-desk-staging.fly.dev/connections/google/callback
   https://ros-desk-production.fly.dev/connections/google/callback
   https://ros-desk-pr-<PR_NUMBER>.fly.dev/connections/google/callback
   http://localhost:5173/connections/google/callback
   ```
7. Click **Create** → copy **Client ID** and **Client Secret**

### 1.2 Enable Required APIs

**APIs & Services → Library** → Enable:
- **Gmail API** (`gmail.googleapis.com`)
- **Google Calendar API** (`calendar-json.googleapis.com`)

### 1.3 Configure OAuth Consent Screen

**APIs & Services → OAuth consent screen**:

| Field | Value |
|-------|-------|
| **User Type** | External |
| **App name** | "Desk" (or your chosen name) |
| **User support email** | Your email |
| **Authorized domains** | `fly.dev`, `localhost` |

**Scopes** (add all three):
```
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.readonly
```

**Test users** (required while in "Testing" mode):
- Add your email + any tester emails (max 100)

---

## 2. GitHub Repository Secrets

Add these secrets in **Settings → Secrets and variables → Actions → Repository secrets**:

### Preview (per-PR deployments)
```
PREVIEW_GOOGLE_PANELS_CLIENT_ID
PREVIEW_GOOGLE_PANELS_CLIENT_SECRET
```

### Staging (main branch)
```
STAGING_GOOGLE_PANELS_CLIENT_ID
STAGING_GOOGLE_PANELS_CLIENT_SECRET
```

### Production (v0.* tags)
```
PRODUCTION_GOOGLE_PANELS_CLIENT_ID
PRODUCTION_GOOGLE_PANELS_CLIENT_SECRET
```

### Microsoft (if using Microsoft panels)
```
PREVIEW_MICROSOFT_CLIENT_ID
PREVIEW_MICROSOFT_CLIENT_SECRET
STAGING_MICROSOFT_CLIENT_ID
STAGING_MICROSOFT_CLIENT_SECRET
PRODUCTION_MICROSOFT_CLIENT_ID
PRODUCTION_MICROSOFT_CLIENT_SECRET
```

---

## 3. Deploy Workflow Configuration

### 3.1 Preview Deploy (`.github/workflows/deploy-preview.yml`)

The workflow already includes this step (added previously):

```yaml
- if: steps.gate.outputs.skip != 'true'
  name: Google OAuth secrets (panels), only when PREVIEW_GOOGLE_PANELS_CLIENT_ID is set
  run: |
    if [ -n "$GOOGLE_PANELS_CLIENT_ID" ]; then
      flyctl secrets set --app "$APP" --stage GOOGLE_PANELS_CLIENT_ID="$GOOGLE_PANELS_CLIENT_ID" GOOGLE_PANELS_CLIENT_SECRET="$GOOGLE_PANELS_CLIENT_SECRET"
    fi
  env:
    GOOGLE_PANELS_CLIENT_ID: ${{ secrets.PREVIEW_GOOGLE_PANELS_CLIENT_ID }}
    GOOGLE_PANELS_CLIENT_SECRET: ${{ secrets.PREVIEW_GOOGLE_PANELS_CLIENT_SECRET }}
```

### 3.2 Staging Deploy (`.github/workflows/deploy-staging.yml`)

Add this step (same pattern as Resend):

```yaml
- if: steps.gate.outputs.skip != 'true'
  name: Google OAuth secrets (panels), only when STAGING_GOOGLE_PANELS_CLIENT_ID is set
  run: |
    if [ -n "$GOOGLE_PANELS_CLIENT_ID" ]; then
      flyctl secrets set --config infra/fly/fly.toml --stage GOOGLE_PANELS_CLIENT_ID="$GOOGLE_PANELS_CLIENT_ID" GOOGLE_PANELS_CLIENT_SECRET="$GOOGLE_PANELS_CLIENT_SECRET"
    fi
  env:
    GOOGLE_PANELS_CLIENT_ID: ${{ secrets.STAGING_GOOGLE_PANELS_CLIENT_ID }}
    GOOGLE_PANELS_CLIENT_SECRET: ${{ secrets.STAGING_GOOGLE_PANELS_CLIENT_SECRET }}
```

### 3.3 Production Deploy (`.github/workflows/deploy-fly.yml`)

In the `promote-production` job, add:

```yaml
- name: Google OAuth secrets (panels), only when PRODUCTION_GOOGLE_PANELS_CLIENT_ID is set
  run: |
    if [ -n "$GOOGLE_PANELS_CLIENT_ID" ]; then
      flyctl secrets set --app ros-desk-production --stage GOOGLE_PANELS_CLIENT_ID="$GOOGLE_PANELS_CLIENT_ID" GOOGLE_PANELS_CLIENT_SECRET="$GOOGLE_PANELS_CLIENT_SECRET"
    fi
  env:
    GOOGLE_PANELS_CLIENT_ID: ${{ secrets.PRODUCTION_GOOGLE_PANELS_CLIENT_ID }}
    GOOGLE_PANELS_CLIENT_SECRET: ${{ secrets.PRODUCTION_GOOGLE_PANELS_CLIENT_SECRET }}
```

---

## 4. Database Feature Flags

Run this SQL in your database (preview/staging/production/local) to enable panels:

```sql
-- Core panels flag (required for any panel)
INSERT INTO flags (key, description, default_on) VALUES 
  ('panels.today', 'Enable Today panel with calendar/mail', true)
ON CONFLICT (key) DO UPDATE SET default_on = EXCLUDED.default_on;

-- Google providers
INSERT INTO flags (key, description, default_on) VALUES 
  ('panels.google_calendar', 'Enable Google Calendar provider', true),
  ('panels.google_mail', 'Enable Gmail provider (requires CASA)', true)
ON CONFLICT (key) DO UPDATE SET default_on = EXCLUDED.default_on;

-- Microsoft provider
INSERT INTO flags (key, description, default_on) VALUES 
  ('panels.microsoft', 'Enable Microsoft provider', true)
ON CONFLICT (key) DO UPDATE SET default_on = EXCLUDED.default_on;

-- Standards-based (CalDAV/IMAP) - no OAuth needed
INSERT INTO flags (key, description, default_on) VALUES 
  ('panels.standards', 'Enable standards-based (CalDAV/IMAP) providers', true)
ON CONFLICT (key) DO UPDATE SET default_on = EXCLUDED.default_on;
```

**Schema reference** (`packages/db/src/schema.ts`):
```typescript
export const flags = pgTable('flags', {
  key: text('key').primaryKey(),        -- e.g., 'panels.today'
  description: text('description').notNull(),
  defaultOn: boolean('default_on').notNull().default(false),
});
```

---

## 5. Local Development Setup

### 5.1 Local `.env` File

Add to your local `.env` (copy from `.env.example`):

```bash
# Panels OAuth (separate from sign-in)
GOOGLE_PANELS_CLIENT_ID=your-local-panels-client-id
GOOGLE_PANELS_CLIENT_SECRET=your-local-panels-client-secret

# Optional: Microsoft
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

### 5.2 Local OAuth Redirect URI

In Google Cloud Console (local client), add:
```
http://localhost:5173/connections/google/callback
```

### 5.3 Run Flags Migration Locally

```bash
pnpm db:migrate
# Then run the INSERT SQL above against your local Postgres
```

---

## 6. Testing the Panels Flow

### 6.1 Verify Deployment

Check deploy logs for:
```
flyctl secrets set ... GOOGLE_PANELS_CLIENT_ID=... GOOGLE_PANELS_CLIENT_SECRET=...
```

### 6.2 Connect Account

1. Open your deployed app: `https://ros-desk-pr-<PR>.fly.dev`
2. Sign in (regular Google sign-in)
3. Go to **Settings → Connected Accounts** (or `/connections`)
4. You should see **Google** as an available provider (if flags enabled)
5. Click **Google** → **Connect**
6. Approve the **Gmail + Calendar** permissions screen
7. After redirect, you'll see the account listed with calendar/mail capabilities

### 6.3 Enable Calendars/Mail Folders

1. Click the connected account
2. Toggle **calendars** and **mail folders** to "Enabled"
3. Go to **Today** panel (`/panels/today`) to see events/messages

---

## 7. Microsoft Panels (Optional)

### 7.1 Azure Portal Setup

1. Go to **Azure Portal → App registrations → New registration**
2. **Name**: "Desk Panels [Environment]"
3. **Redirect URI**: Web → `https://<origin>/connections/microsoft/callback`
4. **API permissions** (delegated):
   - `Calendars.Read`
   - `Mail.Read`
   - `User.Read`
   - `offline_access`
5. Grant admin consent if required

### 7.2 Add Secrets

Same pattern as Google: `MICROSOFT_CLIENT_ID/SECRET` per environment.

### 7.3 Enable Flag

```sql
INSERT INTO flags (key, description, default_on) VALUES 
  ('panels.microsoft', 'Enable Microsoft provider', true)
ON CONFLICT (key) DO UPDATE SET default_on = EXCLUDED.default_on;
```

---

## 8. Standards-Based (CalDAV/IMAP) - No OAuth

For providers like Fastmail, iCloud, self-hosted:

1. Enable flag:
   ```sql
   INSERT INTO flags (key, description, default_on) VALUES 
     ('panels.standards', 'Enable standards-based (CalDAV/IMAP) providers', true)
   ON CONFLICT (key) DO UPDATE SET default_on = EXCLUDED.default_on;
   ```

2. In UI: **Connections → Add Provider → Standards**
3. Fill in CalDAV/IMAP server details (host, port, username, password)
4. No OAuth client needed

---

## 9. Production Considerations

### CASA Assessment (Google Mail)

**Required for production Gmail access** (ADR-0004):
- `panels.google_mail` flag is gated behind CASA
- In "Testing" mode: works for test users without CASA
- To publish: Submit CASA assessment via Google Cloud Console
- Timeline: Can take weeks

### Workarounds for Production Launch

| Option | Description |
|--------|-------------|
| **Launch without Gmail** | Enable only `panels.google_calendar` + `panels.standards` |
| **Use standards for mail** | Fastmail/iCloud/self-hosted via IMAP (no CASA) |
| **Complete CASA** | Full verification for Gmail scope |

---

## 10. Troubleshooting

| Issue | Solution |
|-------|----------|
| "App not verified" | Add email as test user in OAuth consent screen |
| "Redirect URI mismatch" | Ensure `/connections/google/callback` (not `/auth/`) |
| Panels not showing | Check flags are enabled in DB (`default_on = true`) |
| "Provider not configured" | Verify `GOOGLE_PANELS_CLIENT_ID` secret is set and deployed |
| Gmail not working | CASA required for production; use test users in Testing mode |
| Microsoft "invalid scope" | Ensure `offline_access` and `User.Read` are in token request |

---

## 11. Quick Verification Checklist

- [ ] Google Cloud: Panels OAuth client created with correct redirect URIs
- [ ] Google Cloud: Gmail API + Calendar API enabled
- [ ] Google Cloud: OAuth consent screen has gmail.readonly + calendar.readonly scopes
- [ ] Google Cloud: Your email added as test user
- [ ] GitHub: `*_GOOGLE_PANELS_CLIENT_ID/SECRET` secrets added per environment
- [ ] Workflows: Deploy YAML files inject panels secrets (check logs)
- [ ] Database: All 5 panel flags inserted with `default_on = true`
- [ ] Local: `.env` has `GOOGLE_PANELS_CLIENT_ID/SECRET`
- [ ] Test: Can connect Google account in `/connections` and see calendars/mail in Today panel