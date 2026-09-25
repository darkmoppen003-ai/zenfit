-- ZenFit global board — run with: supabase db execute -f supabase/migrations/20260926000000_global_board.sql
-- (after: supabase link --project-ref oeytdfhwtxpwkzyaubad)
-- Idempotent: safe to re-run.

create table if not exists global_broadcasts (
  id uuid default gen_random_uuid() primary key,
  title text,
  body text,
  target text default 'all',
  created_at timestamptz default now()
);

create table if not exists global_events (
  id uuid default gen_random_uuid() primary key,
  title text,
  descr text,
  xp int default 0,
  status text default 'live',
  target text default 'all',
  rules jsonb,
  created_at timestamptz default now()
);

create table if not exists global_rewards (
  id uuid default gen_random_uuid() primary key,
  title text,
  xp int default 0,
  code text,
  target text default 'all',
  created_at timestamptz default now()
);

alter table global_broadcasts enable row level security;
alter table global_events enable row level security;
alter table global_rewards enable row level security;

drop policy if exists "Public read" on global_broadcasts;
create policy "Public read" on global_broadcasts for select using (true);
drop policy if exists "Anon insert" on global_broadcasts;
create policy "Anon insert" on global_broadcasts for insert with check (true);

drop policy if exists "Public read" on global_events;
create policy "Public read" on global_events for select using (true);
drop policy if exists "Anon insert" on global_events;
create policy "Anon insert" on global_events for insert with check (true);

drop policy if exists "Public read" on global_rewards;
create policy "Public read" on global_rewards for select using (true);
drop policy if exists "Anon insert" on global_rewards;
create policy "Anon insert" on global_rewards for insert with check (true);
