-- ⚠️ DESTRUCTIVE: Clears ALL data from the database
-- Run in order (child tables first due to FK constraints)
-- Use with caution - only for test databases!

BEGIN;

-- Panel/cache tables
TRUNCATE TABLE cached_messages CASCADE;
TRUNCATE TABLE cached_events CASCADE;
TRUNCATE TABLE account_calendars CASCADE;
TRUNCATE TABLE connected_accounts CASCADE;

-- Notion sync
TRUNCATE TABLE notion_connections CASCADE;

-- Capture/webhook
TRUNCATE TABLE capture_category_map CASCADE;
TRUNCATE TABLE capture_receipts CASCADE;
TRUNCATE TABLE capture_tokens CASCADE;

-- Expenses
TRUNCATE TABLE expense_versions CASCADE;
TRUNCATE TABLE expenses CASCADE;

-- Imports
TRUNCATE TABLE import_rows CASCADE;
TRUNCATE TABLE import_batches CASCADE;
TRUNCATE TABLE import_profiles CASCADE;

-- Categories
TRUNCATE TABLE categories CASCADE;

-- Feedback
TRUNCATE TABLE feedback CASCADE;

-- Jobs
TRUNCATE TABLE jobs CASCADE;

-- FX rates
TRUNCATE TABLE fx_rates CASCADE;

-- Rate limits
TRUNCATE TABLE rate_limits CASCADE;

-- Auth
TRUNCATE TABLE email_tokens CASCADE;
TRUNCATE TABLE sessions CASCADE;
TRUNCATE TABLE oauth_accounts CASCADE;

-- Flags (user overrides first, then global)
TRUNCATE TABLE user_flags CASCADE;
TRUNCATE TABLE flags CASCADE;

-- Users (last - cascade handles dependent rows but explicit order is safer)
TRUNCATE TABLE users CASCADE;

-- Audit log (if you want to keep audit trail, comment this out)
TRUNCATE TABLE audit_log CASCADE;

-- Reset sequences (if any serial columns exist)
-- Note: This project uses UUIDs, so no sequences to reset

COMMIT;

-- Verify
SELECT 'users' AS table_name, COUNT(*) FROM users
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'connected_accounts', COUNT(*) FROM connected_accounts
UNION ALL SELECT 'flags', COUNT(*) FROM flags
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;
