-- ZenFit global board: owner deletes (admin console outbox management).
-- Anon key ships in the app; the console itself is password-gated.
-- Idempotent: safe to re-run.

drop policy if exists "Anon delete" on global_broadcasts;
create policy "Anon delete" on global_broadcasts for delete using (true);

drop policy if exists "Anon delete" on global_events;
create policy "Anon delete" on global_events for delete using (true);

drop policy if exists "Anon delete" on global_rewards;
create policy "Anon delete" on global_rewards for delete using (true);
