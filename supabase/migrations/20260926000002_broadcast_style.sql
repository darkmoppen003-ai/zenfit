-- ZenFit global broadcasts: styled-message columns (designer ships bg/hl/image/confetti).
-- Idempotent: safe to re-run.

alter table global_broadcasts add column if not exists bg text default 'none';
alter table global_broadcasts add column if not exists hl text default 'none';
alter table global_broadcasts add column if not exists image text default '';
alter table global_broadcasts add column if not exists confetti boolean default false;
