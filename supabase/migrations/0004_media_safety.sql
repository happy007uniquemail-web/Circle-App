-- Circle — TRD Workstream D: media safety (IMG-01..10, VID-01..11, QTA-01..06)
-- Layered defence: bucket limits (hard, enforced by the Storage API) +
-- RLS write-policy gates (per-user quota + hourly rate) + client compression
-- (src/config/limits.ts — same numbers, comment keeps them in sync).
-- Re-runnable: every statement is idempotent.

-- =========================================================================
-- 1. Bucket hard limits (IMG-07, VID-07) — enforced server-side on upload
-- =========================================================================
update storage.buckets
   set file_size_limit = 1048576,                       -- 1 MB (avatar target ≤ 100 KB)
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'avatars';

update storage.buckets
   set file_size_limit = 2097152,                       -- 2 MB post-compress cap (IMG-05)
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'post-images';

update storage.buckets
   set file_size_limit = 52428800,                      -- 50 MB (VID-02)
       allowed_mime_types = array['video/mp4','video/webm','video/quicktime']
 where id = 'media';

-- =========================================================================
-- 2. Per-user quota + upload rate guard (QTA-01/02/06)
--    Evaluated inside the storage INSERT policies below, so direct API
--    uploads are blocked too — client checks are UX only.
-- =========================================================================

-- Bytes currently stored for a user (object name convention: <uid>/<file>).
create or replace function public.circle_user_storage_bytes(p_uid uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0)::bigint
  from storage.objects o
  where split_part(o.name, '/', 1) = p_uid::text;
$$;

-- Objects uploaded in the last hour (QTA-02: 20/hour).
create or replace function public.circle_uploads_last_hour(p_uid uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*)::bigint
  from storage.objects o
  where split_part(o.name, '/', 1) = p_uid::text
    and o.created_at > now() - interval '1 hour';
$$;

-- The single gate used by every write policy.
-- Keep the two constants in sync with src/config/limits.ts
-- (USER_STORAGE_QUOTA_MB = 500, UPLOADS_PER_HOUR = 20).
create or replace function public.circle_can_upload(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null
     and public.circle_user_storage_bytes(p_uid) < 524288000      -- 500 MB per user
     and public.circle_uploads_last_hour(p_uid) < 20;             -- 20 uploads / hour
$$;

-- QTA-01: total bytes per user (computed view — no maintenance needed,
-- always consistent with storage.objects).
create or replace view public.user_storage_usage as
  select split_part(name, '/', 1)::uuid       as user_id,
         sum(coalesce((metadata->>'size')::bigint, 0))::bigint as total_bytes,
         count(*)::bigint                     as object_count
  from storage.objects
  group by 1;

grant select on public.user_storage_usage to authenticated;

-- =========================================================================
-- 3. Rewrite the three owner-write policies: explicit MIME whitelist
--    (fixes F-S1: pg_input_is_valid(...,'mime') only checked syntax) +
--    quota/rate gate.
-- =========================================================================
drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(content_type, '') in ('image/jpeg','image/png','image/webp')
    and public.circle_can_upload(auth.uid())
  );

drop policy if exists "post_images_owner_write" on storage.objects;
create policy "post_images_owner_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(content_type, '') in ('image/jpeg','image/png','image/webp')
    and public.circle_can_upload(auth.uid())
  );

drop policy if exists "media_owner_write" on storage.objects;
create policy "media_owner_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(content_type, '') in ('video/mp4','video/webm','video/quicktime')
    and public.circle_can_upload(auth.uid())
  );

-- =========================================================================
-- 4. Orphan cleanup (QTA-03/04): objects >24 h old that no LIVE row
--    references (post/comment images, video, avatar, live story, DM media).
--    Soft-deleted posts, expired stories and purged rows therefore release
--    their media automatically. Runs hourly via pg_cron when available;
--    otherwise call `select public.circle_cleanup_orphans()` manually /
--    from a scheduled Edge Function.
-- =========================================================================
create table if not exists public.cleanup_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  deleted_count int not null default 0,
  note text
);

create or replace function public.circle_cleanup_orphans()
returns void language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  with removed as (
    delete from storage.objects o
    where o.created_at < now() - interval '24 hours'
      and not exists (
        select 1 from posts p
        where p.deleted_at is null
          and (array_to_string(p.image_urls, ' ') like '%' || o.name || '%'
               or coalesce(p.video_url, '') like '%' || o.name || '%')
      )
      and not exists (
        select 1 from comments c
        where array_to_string(c.image_urls, ' ') like '%' || o.name || '%'
      )
      and not exists (
        select 1 from profiles pr
        where coalesce(pr.avatar_url, '') like '%' || o.name || '%'
      )
      and not exists (
        select 1 from stories s
        where s.expires_at > now() and coalesce(s.media, '') like '%' || o.name || '%'
      )
      and not exists (
        select 1 from messages m
        where coalesce(m.media, '') like '%' || o.name || '%'
      )
    returning 1
  ) select count(*) into v_deleted from removed;

  insert into public.cleanup_log (deleted_count, note)
  values (v_deleted, 'orphans >24h');
end;
$$;

-- Schedule (idempotent attempt; silently skipped when pg_cron is absent).
do $do$
begin
  perform cron.unschedule('circle-cleanup-orphans');  -- no-op/error when never scheduled
  perform cron.schedule('circle-cleanup-orphans', '43 * * * *',
                        $job$select public.circle_cleanup_orphans()$job$);
exception when others then
  raise warning 'pg_cron scheduling skipped: %', sqlerrm;
end
$do$;
