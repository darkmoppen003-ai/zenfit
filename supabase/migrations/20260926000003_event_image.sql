-- ZenFit global events: mission image column (admin mission designer).
-- Idempotent: safe to re-run.

alter table global_events add column if not exists image text default '';
