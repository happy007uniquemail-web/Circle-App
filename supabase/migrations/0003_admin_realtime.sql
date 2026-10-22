-- Circle — 0003: admin moderation + full realtime coverage
-- Apply after 0002_features.sql: supabase db push (or SQL editor).
-- Idempotent: safe to re-run.

-- =========================================================================
-- Admin moderation (MOD-3): admins may suspend/restore any profile.
-- Without this, the profiles_update_own policy makes moderation a silent no-op.
-- =========================================================================

drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles
  for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (true);

-- =========================================================================
-- Admin read access to soft-deleted posts (MOD-4): the moderation queue must
-- be able to preview reported content the author deleted. Block filtering is
-- preserved for everyone else.
-- =========================================================================

drop policy if exists "posts_select_not_deleted" on posts;
drop policy if exists "posts_select_visible_or_admin" on posts;
create policy "posts_select_visible_or_admin" on posts
  for select to authenticated
  using (
    (
      deleted_at is null
      or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    and author_id <> all (
      select case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end
      from blocks b
      where b.blocker_id = auth.uid() or b.blocked_id = auth.uid()
    )
  );

-- =========================================================================
-- Realtime: 0002 added notifications/messages/likes/reposts/follows to the
-- supabase_realtime publication. Posts, comments, stories and profile edits
-- now stream too, so feeds, threads and avatars update without a reload.
-- =========================================================================

alter publication supabase_realtime add table if not exists posts;
alter publication supabase_realtime add table if not exists comments;
alter publication supabase_realtime add table if not exists stories;
alter publication supabase_realtime add table if not exists profiles;

-- =========================================================================
-- Housekeeping: hard-purge stories past expiry hourly (RLS already hides
-- them; this frees storage). Requires pg_cron — silently skipped if absent
-- (e.g. on a free project without the extension enabled).
-- =========================================================================

do $do$
begin
  perform cron.schedule('circle-purge-stories', '17 * * * *', $cron$delete from public.stories where expires_at < now()$cron$);
exception
  when others then null; -- pg_cron not available; hidden-by-RLS is enough
end $do$;
