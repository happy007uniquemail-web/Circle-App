-- 0006_privacy.sql — Workstream E (PRV-01, PRV-02, PRV-03, PRV-05, PRV-07, PRV-08, PRV-12)
-- Adds profile visibility + per-field toggles + DM/invite permissions, makes
-- follows status-aware (pending | accepted) with server-forced approval for
-- private accounts, introduces mutes, rewrites the select policies so hidden
-- content is hidden by the database (not only the UI), and exposes a
-- security-invoker public_profiles view for PRV-12.
--
-- Notes on enforcement scope (see docs/audit/privacy.md §E-fixes):
--  * PRV-04 follow-list / join-date toggles are column-level preferences;
--    Postgres RLS is row-level, so those two are UI-enforced (their AC does
--    not require RLS, unlike PRV-02/05/07). Counts stay accurate for others.
--  * PRV-09 discoverable is enforced in the search/suggestion selectors.
--  * PRV-06 cabin_invite_permission: column + UI here; enforcement trigger
--    lands with Workstream G when cabins exist (§12 ordering).
--  * PRV-13 (data download) is the TRD's optional phase 2 — not implemented.

begin;

-- PRV-01/04/05/06/09: profile privacy columns ------------------------------
alter table public.profiles
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'followers', 'private')),
  add column if not exists show_email boolean not null default false,      -- forward-compat: no email column exists
  add column if not exists show_location boolean not null default true,    -- forward-compat: no location column exists
  add column if not exists show_interests boolean not null default true,   -- pre-wired for Workstream F
  add column if not exists show_join_date boolean not null default true,
  add column if not exists show_follow_lists boolean not null default true,
  add column if not exists dm_permission text not null default 'everyone'
    check (dm_permission in ('everyone', 'followers', 'nobody')),
  add column if not exists cabin_invite_permission text not null default 'everyone'
    check (cabin_invite_permission in ('everyone', 'followers', 'nobody')),
  add column if not exists discoverable boolean not null default true;

-- PRV-03: follows become status-aware. Existing rows backfill to 'accepted'
-- so every current follow stays valid (PRV-11: visibility changes never
-- delete follows).
alter table public.follows
  add column if not exists status text not null default 'accepted'
    check (status in ('pending', 'accepted'));

-- Shared helper: safe admin check usable inside RLS without recursion
-- (a policy on profiles may not query profiles directly).
create or replace function public.is_admin(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_uid and role = 'admin');
$$;

-- PRV-08: mutes — hide someone's content from my feeds without blocking them.
create table if not exists public.mutes (
  muter_id uuid not null references public.profiles(id) on delete cascade,
  muted_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

alter table public.mutes enable row level security;

drop policy if exists "mutes_own" on public.mutes;
create policy mutes_own on public.mutes
  for all to authenticated
  using (muter_id = (select auth.uid()))
  with check (muter_id = (select auth.uid()));

grant select, insert, update, delete on public.mutes to authenticated;

-- PRV-12: public_profiles exposes only safe columns through a security-invoker
-- view, so the caller's RLS applies. profiles_select targets `authenticated`,
-- so this returns zero rows for anon (verify: set role anon; select count(*)
-- from public_public_profiles — expect 0). No email or auth metadata exists in
-- profiles at all; auth.users is never selectable from the client.
create or replace view public.public_profiles
with (security_invoker = true) as
select id, username, display_name, bio, avatar_url, role, created_at,
       visibility, discoverable, show_join_date, show_follow_lists
from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- PRV-07: a blocked user cannot see the blocker's profile row at all
-- (avatar/username/bio included). The blocker still sees everyone so their
-- block list in Settings keeps rendering.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin((select auth.uid()))
    or not exists (
      select 1 from public.blocks b
      where b.blocker_id = public.profiles.id and b.blocked_id = (select auth.uid())
    )
  );

-- PRV-02: posts of followers-only / private accounts are visible only to the
-- author, accepted followers, and admins. Muted authors' posts disappear from
-- the caller's rows entirely (PRV-08, server-side). Blocks stay symmetric.
drop policy if exists "posts_select_not_deleted" on public.posts;
create policy posts_select_visible on public.posts
  for select to authenticated
  using (
    deleted_at is null
    and author_id <> all (  -- blocked users see neither direction (FEED-4 / PRV-07)
      select case when b.blocker_id = (select auth.uid()) then b.blocked_id else b.blocker_id end
      from public.blocks b where b.blocker_id = (select auth.uid()) or b.blocked_id = (select auth.uid())
    )
    and not exists (  -- PRV-08: I do not see posts from people I muted
      select 1 from public.mutes m where m.muter_id = (select auth.uid()) and m.muted_id = author_id
    )
    and (
      author_id = (select auth.uid())
      or public.is_admin((select auth.uid()))  -- moderation queue stays complete
      or exists (select 1 from public.profiles a where a.id = author_id and a.visibility = 'public')
      or exists (  -- accepted followers only: pending requests do not grant access
        select 1 from public.follows f
        where f.follower_id = (select auth.uid()) and f.following_id = author_id and f.status = 'accepted'
      )
    )
  );

-- PRV-02: comments follow their post's visibility (no leaking comment threads
-- under hidden posts). Blocks/mutes of the post author also apply.
drop policy if exists "comments_select" on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (
    exists (
      select 1 from public.posts po
      where po.id = post_id
        and po.deleted_at is null
        and po.author_id <> all (
          select case when b.blocker_id = (select auth.uid()) then b.blocked_id else b.blocker_id end
          from public.blocks b where b.blocker_id = (select auth.uid()) or b.blocked_id = (select auth.uid())
        )
        and not exists (
          select 1 from public.mutes m where m.muter_id = (select auth.uid()) and m.muted_id = po.author_id
        )
        and (
          po.author_id = (select auth.uid())
          or public.is_admin((select auth.uid()))
          or exists (select 1 from public.profiles a where a.id = po.author_id and a.visibility = 'public')
          or exists (
            select 1 from public.follows f
            where f.follower_id = (select auth.uid()) and f.following_id = po.author_id and f.status = 'accepted'
          )
        )
    )
  );

-- PRV-03: pending follow requests are only visible to the two parties (and
-- admins); accepted rows stay public for counts and lists.
drop policy if exists "follows_select" on public.follows;
create policy follows_select on public.follows
  for select to authenticated
  using (
    status = 'accepted'
    or follower_id = (select auth.uid())
    or following_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

-- PRV-07: no following across a block in either direction.
drop policy if exists "follows_insert_own" on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and follower_id <> following_id
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = following_id)
         or (b.blocker_id = following_id and b.blocked_id = (select auth.uid()))
    )
  );

-- PRV-03: only the followee can approve (update the status of) a request;
-- the follower can still delete their own row to cancel/unfollow.
drop policy if exists "follows_update_target" on public.follows;
create policy follows_update_target on public.follows
  for update to authenticated
  using (following_id = (select auth.uid()))
  with check (following_id = (select auth.uid()));

-- PRV-03: server-forced approval. A client that inserts 'accepted' directly
-- against a private account is downgraded to 'pending'; nobody can rewrite
-- who a row connects or downgrade an accepted follow back to pending.
create or replace function public.enforce_follow_status()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_visibility text;
begin
  if tg_op = 'INSERT' then
    select visibility into v_visibility from public.profiles where id = new.following_id;
    if v_visibility = 'private' then
      new.status := 'pending';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.follower_id <> old.follower_id or new.following_id <> old.following_id then
    raise exception 'A follow row cannot be re-pointed at different users.';
  end if;
  if old.status = 'accepted' and new.status = 'pending' then
    raise exception 'An accepted follow cannot become pending.';
  end if;
  return new;
end;
$$;

drop trigger if exists follows_enforce_status on public.follows;
create trigger follows_enforce_status
  before insert or update on public.follows
  for each row execute function public.enforce_follow_status();

-- PRV-03 notifications, both ways: request -> follow_request to the target,
-- approval -> follow_request_approved to the requester. Replaces 0005's
-- unconditional 'follow' trigger for INSERTs; UPDATE fires only on approval.
drop trigger if exists notifications_on_follow on public.follows;

create or replace function public.dispatch_follow_notification()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.notify(
        new.following_id, new.follower_id, 'follow_request', 'user', new.follower_id, '{}'::jsonb);
    else
      perform public.notify(
        new.following_id, new.follower_id, 'follow', 'user', new.follower_id, '{}'::jsonb);
    end if;
  elsif new.status = 'accepted' and old.status = 'pending' then
    perform public.notify(
      new.follower_id, new.following_id, 'follow_request_approved', 'user', new.following_id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_on_follow_insert on public.follows;
create trigger notifications_on_follow_insert
  after insert on public.follows
  for each row execute function public.dispatch_follow_notification();

drop trigger if exists notifications_on_follow_update on public.follows;
create trigger notifications_on_follow_update
  after update on public.follows
  for each row when (old.status = 'pending' and new.status = 'accepted')
  execute function public.dispatch_follow_notification();

-- PRV-05: DM permission enforced in the policies themselves. Group
-- conversations (cabins, Workstream G) skip the 1:1 gate.
drop policy if exists "conversation_members_insert_member" on public.conversation_members;
create policy conversation_members_insert_member on public.conversation_members
  for insert to authenticated
  with check (
    (
      exists (select 1 from public.conversation_members cm
              where cm.conversation_id = conversation_id and cm.user_id = (select auth.uid()))
      or not exists (select 1 from public.conversation_members cm2
                     where cm2.conversation_id = conversation_id)  -- creator
    )
    and not exists (  -- PRV-07: no DM threads across a block
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = user_id)
         or (b.blocker_id = user_id and b.blocked_id = (select auth.uid()))
    )
    and (
      user_id = (select auth.uid())  -- joining/creating for myself is always allowed
      or (select count(*) from public.conversation_members cm3
          where cm3.conversation_id = conversation_id) > 1  -- group: Workstream G rules
      or not exists (  -- 1:1 recipient's dm_permission gate
        select 1 from public.profiles p
        where p.id = user_id
          and (
            p.dm_permission = 'nobody'
            or (p.dm_permission = 'followers'
                and not exists (
                  select 1 from public.follows f
                  where f.follower_id = (select auth.uid())
                    and f.following_id = user_id
                    and f.status = 'accepted'))
          )
      )
    )
  );

drop policy if exists "messages_insert_member" on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id and cm.user_id = (select auth.uid())
    )
    -- PRV-07: no messaging across a block in either direction
    and not exists (
      select 1 from public.conversation_members cm2
      join public.blocks b on (
        (b.blocker_id = (select auth.uid()) and b.blocked_id = cm2.user_id)
        or (b.blocker_id = cm2.user_id and b.blocked_id = (select auth.uid()))
      )
      where cm2.conversation_id = conversation_id and cm2.user_id <> (select auth.uid())
    )
    -- PRV-05: 1:1 recipients enforce their dm_permission (groups skip)
    and (
      (select count(*) from public.conversation_members cm3
       where cm3.conversation_id = conversation_id) > 2
      or not exists (
        select 1 from public.conversation_members cm4
        join public.profiles p on p.id = cm4.user_id
        where cm4.conversation_id = conversation_id
          and cm4.user_id <> (select auth.uid())
          and (
            p.dm_permission = 'nobody'
            or (p.dm_permission = 'followers'
                and not exists (
                  select 1 from public.follows f
                  where f.follower_id = (select auth.uid())
                    and f.following_id = cm4.user_id
                    and f.status = 'accepted'))
          )
      )
    )
  );

commit;
