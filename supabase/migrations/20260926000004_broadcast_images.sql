-- ZenFit global broadcasts: inline body images (token-based [img:N] list).
-- Idempotent: safe to re-run.

alter table global_broadcasts add column if not exists images jsonb default '[]';
