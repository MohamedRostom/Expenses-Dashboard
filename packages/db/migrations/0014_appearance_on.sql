-- Theme selection and colours on for everyone by default (Rostom, 2026-11-20).
-- Upsert so fresh databases and existing ones (staging, production) both end up on; per-user
-- overrides in user_flags still win.
INSERT INTO "flags" ("key", "description", "default_on") VALUES
  ('appearance.accent', 'User-selectable accent colour presets', true),
  ('appearance.motion', 'Background motion, motion colour, panel and pause controls', true)
ON CONFLICT ("key") DO UPDATE SET "default_on" = true;
