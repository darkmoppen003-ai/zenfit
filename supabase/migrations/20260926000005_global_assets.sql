-- ZenFit global asset registry: wallpapers + themes deployed to all devices.
-- Admin console manages these (visible admin-only); users fetch read-only.
-- Idempotent: safe to re-run.

create table if not exists global_assets (
  id uuid default gen_random_uuid() primary key,
  kind text default 'wallpaper',
  name text,
  url text default '',
  data jsonb,
  created_at timestamptz default now()
);

alter table global_assets enable row level security;

drop policy if exists "Public read" on global_assets;
create policy "Public read" on global_assets for select using (true);
drop policy if exists "Anon insert" on global_assets;
create policy "Anon insert" on global_assets for insert with check (true);
drop policy if exists "Anon delete" on global_assets;
create policy "Anon delete" on global_assets for delete using (true);
