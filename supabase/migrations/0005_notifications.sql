-- =========================================================================
-- 0005 — Notification fix (TRD §5, NOT-01..NOT-09)
-- =========================================================================
-- NOT-00 root causes fixed here:
--   * shape: table now matches NOT-01 exactly (user_id, entity_type/entity_id,
--     data jsonb, is_read) — old recipient_id/post_id/read_at columns are
--     renamed/dropped after backfill.
--   * dedupe: like/unlike/like loops and double-taps spammed rows — the
--     notify() definer function collapses same actor+type+entity repeats
--     inside a 10-minute window (NOT-03).
--   * muted categories (NOT-09) were ignored — notify() checks mute set and
--     never creates the row.
--   * mentions had no notification (NOT-02) — new trigger scans @usernames.
--   * blocked pairs could notify each other — block check in notify().
--   * badge query had no supporting index — (user_id, is_read, created_at
--     desc) added (NOT-01/NOT-06).
-- Follow-request notifications (NOT-02) get their trigger in Workstream E's
-- migration, where the follow_requests table is born (§12 ordering).
-- =========================================================================

-- 1) Reshape to the NOT-01 contract (pre-launch DB; backfill then drop). ---
alter table notifications rename column recipient_id to user_id;

alter table notifications add column if not exists entity_type text;
alter table notifications add column if not exists entity_id uuid;
alter table notifications add column if not exists data jsonb not null default '{}'::jsonb;
alter table notifications add column if not exists is_read boolean not null default false;

update notifications
   set entity_type = case when post_id is not null then 'post' else 'user' end,
       entity_id   = coalesce(post_id, actor_id),
       is_read     = (read_at is not null)
 where entity_type is null;

alter table notifications alter column entity_type set not null;
alter table notifications drop column if exists post_id;
alter table notifications drop column if exists read_at;

-- widen the type set to every event NOT-02 lists (cabin triggers land in G)
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications
  add constraint notifications_type_check check (type in (
    'follow','like','comment','repost','mention',
    'follow_request','follow_request_approved',
    'cabin_join_request','cabin_request_approved','cabin_invite'
  ));

drop index if exists notifications_recipient_idx;
create index notifications_recipient_idx
  on notifications (user_id, is_read, created_at desc);

-- 2) RLS on the new column names (NOT-04): select/update own; no INSERT
--    policy at all — only the security-definer notify() writes rows. -------
drop policy if exists "notifications_select_own" on notifications;
drop policy if exists "notifications_read_own" on notifications; -- legacy 0001 name
drop policy if exists "notifications_update_own" on notifications;
drop policy if exists "notifications_delete_own" on notifications;
create policy "notifications_select_own"
  on notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications_update_own"
  on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete_own"
  on notifications for delete to authenticated
  using (user_id = auth.uid());

-- 3) Mute preferences (NOT-09) --------------------------------------------
create table if not exists notification_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  muted_types text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table notification_prefs enable row level security;
drop policy if exists "notification_prefs_own" on notification_prefs;
create policy "notification_prefs_own"
  on notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4) The one notify() used by every trigger (NOT-02/03/09). ----------------
create or replace function public.notify(
  p_recipient uuid,
  p_actor uuid,
  p_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_data jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then
    return; -- NOT-03: no self-notifications
  end if;

  if exists (
    select 1 from blocks b
    where (b.blocker_id = p_recipient and b.blocked_id = p_actor)
       or (b.blocker_id = p_actor and b.blocked_id = p_recipient)
  ) then
    return;
  end if;

  if exists (
    select 1 from notification_prefs np
    where np.user_id = p_recipient and p_type = any (np.muted_types)
  ) then
    return; -- NOT-09: muted → row is never created
  end if;

  if exists (
    select 1 from notifications n
    where n.user_id = p_recipient
      and n.actor_id = p_actor
      and n.type = p_type
      and n.entity_type = p_entity_type
      and n.entity_id is not distinct from p_entity_id
      and n.created_at > now() - interval '10 minutes'
  ) then
    return; -- NOT-03: collapse repeats inside the window
  end if;

  insert into notifications (user_id, actor_id, type, entity_type, entity_id, data)
  values (p_recipient, p_actor, p_type, p_entity_type, p_entity_id, p_data);
end;
$$;

-- 5) Event triggers → notify() (NOT-02). Old 0001/0002 functions are
--    replaced: they wrote the pre-reshape shape. ---------------------------
create or replace function public.dispatch_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  if tg_table_name = 'follows' then
    perform public.notify(
      new.following_id, new.follower_id, 'follow', 'user', new.follower_id);

  elsif tg_table_name = 'likes' then
    select author_id into v_author from posts where id = new.post_id;
    perform public.notify(
      v_author, new.user_id, 'like', 'post', new.post_id,
      jsonb_build_object('post_id', new.post_id));

  elsif tg_table_name = 'reposts' then
    select author_id into v_author from posts where id = new.post_id;
    perform public.notify(
      v_author, new.user_id, 'repost', 'post', new.post_id,
      jsonb_build_object('post_id', new.post_id));

  elsif tg_table_name = 'comments' then
    select author_id into v_author from posts where id = new.post_id;
    perform public.notify(
      v_author, new.author_id, 'comment', 'post', new.post_id,
      jsonb_build_object('post_id', new.post_id, 'comment_id', new.id));

  end if;
  return new;
end;
$$;

drop trigger if exists notifications_on_follow on follows;
create trigger notifications_on_follow
  after insert on follows
  for each row execute function public.dispatch_notification();
drop trigger if exists notifications_on_like on likes;
create trigger notifications_on_like
  after insert on likes
  for each row execute function public.dispatch_notification();
drop trigger if exists notifications_on_repost on reposts;
create trigger notifications_on_repost
  after insert on reposts
  for each row execute function public.dispatch_notification();
drop trigger if exists notifications_on_comment on comments;
create trigger notifications_on_comment
  after insert on comments
  for each row execute function public.dispatch_notification();

-- 6) Mentions (NOT-02): @username in a post or comment body. --------------
create or replace function public.dispatch_mention_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_handle text;
  v_target uuid;
begin
  for v_handle in
    select distinct lower(sub[1])
      from regexp_matches(coalesce(new.body, ''), '@([A-Za-z0-9_]{3,32})', 'g') sub
  loop
    select id into v_target from profiles where lower(username) = v_handle;
    if v_target is not null then
      perform public.notify(
        v_target, new.author_id, 'mention',
        case when tg_table_name = 'posts' then 'post' else 'comment' end,
        case when tg_table_name = 'posts' then new.id else new.post_id end,
        jsonb_build_object(
          'post_id', case when tg_table_name = 'posts' then new.id else new.post_id end,
          'kind', tg_table_name));
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists mentions_on_post on posts;
create trigger mentions_on_post
  after insert on posts
  for each row execute function public.dispatch_mention_notifications();
drop trigger if exists mentions_on_comment on comments;
create trigger mentions_on_comment
  after insert on comments
  for each row execute function public.dispatch_mention_notifications();

-- 7) Profile rows are referenced by notification_prefs --------------------
grant select, insert, update on notification_prefs to authenticated;
