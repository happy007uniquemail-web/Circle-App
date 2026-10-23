-- 0008_cabins.sql — Workstream G (CAB-01..15, CHT-01..14)
-- Interest-based group spaces: creation, joining (open + request), roles,
-- moderation, unread tracking, and the group chat itself.
--
-- Enforcement notes (see docs/audit/cabins.md):
--   * Membership only ever enters through security-definer functions
--     (join_cabin / approve_join_request) or the owner auto-insert; there is
--     no authenticated INSERT policy on cabin_members — default deny (SEC-01).
--   * CAB-05 limits (own ≤5, joined ≤50, members ≤max), CAB-08 reserved
--     names, CHT-04 length, CHT-11 rate limit are all DB triggers/checks.
--   * PRV-07 blocks are respected in notify() and in the client member lists;
--     PRV-06 (cabin_invite_permission) gates the invite-only phase-2 feature.
--   * Deferred: invite-only type (phase 2), presence/typing (CHT-10 phase 2),
--     system messages (CHT-15 optional).

begin;

-- ---------------------------------------------------------------- tables ---

create table if not exists public.cabins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_lower text generated always as (lower(name)) stored, -- CAB-01 uniqueness
  description text,
  image_url text,
  type text not null default 'open' check (type in ('open', 'request')),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  max_members int not null default 500 check (max_members > 0 and max_members <= 5000),
  member_count int not null default 0, -- maintained by triggers; discovery-safe counts
  created_at timestamptz not null default now(),
  check (char_length(name) between 3 and 40),            -- CAB-01
  check (description is null or char_length(description) <= 300) -- CAB-01
);
create unique index if not exists cabins_name_lower_uniq on public.cabins (name_lower);

create table if not exists public.cabin_interests (
  cabin_id uuid not null references public.cabins(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  primary key (cabin_id, interest_id)
);
create index if not exists cabin_interests_interest_idx on public.cabin_interests (interest_id);

create table if not exists public.cabin_members (
  cabin_id uuid not null references public.cabins(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'banned')),
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (cabin_id, user_id)
);
create index if not exists cabin_members_user_idx on public.cabin_members (user_id);

create table if not exists public.cabin_join_requests (
  id uuid primary key default gen_random_uuid(),
  cabin_id uuid not null references public.cabins(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz not null default now()
);
-- One pending request per person per cabin (re-requests allowed after a
-- decline: terminal rows don't collide). Deviation from the TRD sketch's
-- unique(cabin_id,user_id,status), which would break on a second approve.
create unique index if not exists cabin_join_requests_pending_uniq
  on public.cabin_join_requests (cabin_id, user_id) where status = 'pending';

create table if not exists public.cabin_messages (
  id uuid primary key default gen_random_uuid(),
  cabin_id uuid not null references public.cabins(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text check (body is null or char_length(body) <= 2000), -- CHT-04
  image_url text,
  reply_to uuid references public.cabin_messages(id) on delete set null,
  is_deleted boolean not null default false, -- CHT-08 soft delete
  created_at timestamptz not null default now()
);
create index if not exists cabin_messages_cabin_created_idx
  on public.cabin_messages (cabin_id, created_at desc);

-- ---------------------------------------------------------------- helpers ---

/** Owner-or-active-admin of a cabin (security definer: usable inside policies
 *  without recursing through cabin_members' own RLS). */
create or replace function public.is_cabin_admin(p_cabin uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.cabin_members m
    where m.cabin_id = p_cabin
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
      and m.status = 'active'
  );
$$;

/** Is `p_user` an active member of `p_cabin`? (used by message policies) */
create or replace function public.is_cabin_member(p_cabin uuid, p_user uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.cabin_members m
    where m.cabin_id = p_cabin and m.user_id = p_user and m.status = 'active'
  );
$$;

-- -------------------------------------------------------------- triggers ---

-- CAB-08: reserved/offensive names blocked (starter list; a production build
-- would swap in a screening service — see docs/audit/cabins.md).
create or replace function public.enforce_cabin_name()
returns trigger
language plpgsql as $$
begin
  new.name := trim(new.name);
  if char_length(new.name) < 3 or char_length(new.name) > 40 then
    raise exception 'Cabin names must be 3–40 characters.';
  end if;
  if lower(new.name) in (
    'admin','administrator','circle','official','support','help','root','system',
    'api','www','moderator','staff','security','billing','legal','anonymous',
    'fuck','shit','bitch','asshole','bastard','nazi','hitler','rape'
  ) then
    raise exception 'That name is reserved — please pick another.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabins_enforce_name on public.cabins;
create trigger cabins_enforce_name
  before insert or update of name on public.cabins
  for each row execute function public.enforce_cabin_name();

-- Structural columns are trigger-owned: member_count is only ever moved by
-- cabin_members_count() (nested = depth ≥ 2), identity columns never move,
-- and owner_id only via transfer_cabin_ownership (caller = current owner).
create or replace function public.enforce_cabin_fields()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.member_count := 0; -- always starts empty; the owner row adds 1 via trigger
    return new;
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Cabin identity fields cannot be changed.';
  end if;
  if new.member_count is distinct from old.member_count and pg_trigger_depth() < 2 then
    raise exception 'Member counts are managed automatically.';
  end if;
  if new.owner_id is distinct from old.owner_id and old.owner_id is distinct from (select auth.uid()) then
    raise exception 'Only the current owner can transfer ownership.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabins_enforce_fields on public.cabins;
create trigger cabins_enforce_fields
  before insert or update on public.cabins
  for each row execute function public.enforce_cabin_fields();

-- CAB-05: at most 5 owned cabins.
create or replace function public.enforce_cabin_create_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  select count(*) into v_count from public.cabins where owner_id = new.owner_id;
  if v_count >= 5 then
    raise exception 'You can own at most 5 cabins.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabins_enforce_create_limit on public.cabins;
create trigger cabins_enforce_create_limit
  before insert on public.cabins
  for each row execute function public.enforce_cabin_create_limit();

-- CAB-02: creator becomes owner (no client-controlled role entry point).
create or replace function public.cabins_after_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cabin_members (cabin_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
drop trigger if exists cabins_owner_on_insert on public.cabins;
create trigger cabins_owner_on_insert
  after insert on public.cabins
  for each row execute function public.cabins_after_insert();

-- CAB-05/CAB-14: join ≤50, members ≤max, banned cannot (re)join, no dupes.
create or replace function public.enforce_cabin_member_limits()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max integer; v_count integer; v_joined integer;
begin
  if exists (
    select 1 from public.cabin_members m
    where m.cabin_id = new.cabin_id and m.user_id = new.user_id and m.status = 'banned'
  ) then
    raise exception 'You were removed from this cabin and cannot rejoin.';
  end if;
  if exists (
    select 1 from public.cabin_members m
    where m.cabin_id = new.cabin_id and m.user_id = new.user_id
  ) then
    raise exception 'You are already in this cabin.';
  end if;
  select max_members into v_max from public.cabins where id = new.cabin_id;
  select count(*) into v_count from public.cabin_members where cabin_id = new.cabin_id;
  if v_count >= coalesce(v_max, 500) then
    raise exception 'This cabin is full.';
  end if;
  select count(*) into v_joined
    from public.cabin_members where user_id = new.user_id and status = 'active';
  if v_joined >= 50 then
    raise exception 'You can join at most 50 cabins.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_members_enforce_limits on public.cabin_members;
create trigger cabin_members_enforce_limits
  before insert on public.cabin_members
  for each row execute function public.enforce_cabin_member_limits();

-- Roles/status: owner-or-admin only; only the owner may grant the owner role
-- or demote the current owner (self-demote = transfer). Other column changes
-- (muted / last_read_at) are self-row only. Single-owner invariant: granting
-- ownership demotes the previous owner (AFTER).
create or replace function public.enforce_cabin_member_update()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid());
begin
  if (new.role is distinct from old.role) or (new.status is distinct from old.status) then
    if not exists (
      select 1 from public.cabin_members m
      where m.cabin_id = old.cabin_id and m.user_id = v_uid
        and m.role in ('owner', 'admin') and m.status = 'active'
    ) then
      raise exception 'Only the owner or an admin can do that.';
    end if;
    if new.role = 'owner' and not exists (
      select 1 from public.cabin_members m
      where m.cabin_id = old.cabin_id and m.user_id = v_uid and m.role = 'owner'
    ) then
      raise exception 'Only the owner can transfer ownership.';
    end if;
    if old.role = 'owner' and new.role is distinct from 'owner' and old.user_id is distinct from v_uid then
      raise exception 'The owner cannot be demoted — transfer ownership instead.';
    end if;
    -- CAB-13: admins must not be able to BAN (or otherwise deactivate) the owner.
    if old.role = 'owner' and new.status is distinct from 'active' and old.user_id is distinct from v_uid then
      raise exception 'The owner cannot be removed — transfer ownership first.';
    end if;
  elsif old.user_id is distinct from v_uid then
    raise exception 'You can only update your own membership.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_members_enforce_update on public.cabin_members;
create trigger cabin_members_enforce_update
  before update on public.cabin_members
  for each row execute function public.enforce_cabin_member_update();

create or replace function public.cabin_members_after_update()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'owner' then
    -- single-owner invariant: the previous owner steps down to admin
    update public.cabin_members set role = 'admin'
    where cabin_id = new.cabin_id and role = 'owner' and user_id <> new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_members_single_owner on public.cabin_members;
create trigger cabin_members_single_owner
  after update on public.cabin_members
  for each row execute function public.cabin_members_after_update();

-- CAB-13: owner leaves only when sole member (else transfer first); admins
-- cannot remove the owner. Keeps member_count and empty cabins tidy.
create or replace function public.enforce_cabin_member_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' then
    if (select auth.uid()) is distinct from old.user_id and exists (
      select 1 from public.cabin_members m
      where m.cabin_id = old.cabin_id and m.user_id <> old.user_id
    ) then
      raise exception 'The owner cannot be removed — transfer ownership first.';
    end if;
    if (select auth.uid()) = old.user_id and exists (
      select 1 from public.cabin_members m
      where m.cabin_id = old.cabin_id and m.user_id <> old.user_id
    ) then
      raise exception 'Transfer ownership before leaving this cabin.';
    end if;
  end if;
  return old;
end;
$$;
drop trigger if exists cabin_members_enforce_delete on public.cabin_members;
create trigger cabin_members_enforce_delete
  before delete on public.cabin_members
  for each row execute function public.enforce_cabin_member_delete();

create or replace function public.cabin_members_count()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.cabins set member_count = member_count + 1 where id = new.cabin_id;
    return new;
  end if;
  update public.cabins set member_count = greatest(member_count - 1, 0) where id = old.cabin_id;
  if not exists (select 1 from public.cabin_members where cabin_id = old.cabin_id) then
    delete from public.cabins where id = old.cabin_id; -- sole owner left: retire the cabin
  end if;
  return old;
end;
$$;
drop trigger if exists cabin_members_track_count_ins on public.cabin_members;
create trigger cabin_members_track_count_ins
  after insert on public.cabin_members
  for each row execute function public.cabin_members_count();
drop trigger if exists cabin_members_track_count_del on public.cabin_members;
create trigger cabin_members_track_count_del
  after delete on public.cabin_members
  for each row execute function public.cabin_members_count();

-- CAB-01: 1–10 interest tags (max server-side; min-1 is the create-form rule).
create or replace function public.enforce_cabin_interest_count()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  select count(*) into v_count from public.cabin_interests where cabin_id = new.cabin_id;
  if v_count >= 10 then
    raise exception 'Cabins can have at most 10 interest tags.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_interests_enforce_count on public.cabin_interests;
create trigger cabin_interests_enforce_count
  before insert on public.cabin_interests
  for each row execute function public.enforce_cabin_interest_count();

-- CAB-11: request rows are pending-on-entry, cabin must be type 'request',
-- message ≤200, banned/members blocked (CAB-14).
create or replace function public.enforce_join_request_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  select type into v_type from public.cabins where id = new.cabin_id;
  if v_type is null then
    raise exception 'Cabin not found.';
  end if;
  if v_type <> 'request' then
    raise exception 'This cabin is open — just join it.';
  end if;
  if new.status <> 'pending' then
    raise exception 'Join requests start as pending.';
  end if;
  if public.is_cabin_member(new.cabin_id, new.user_id) then
    raise exception 'You are already in this cabin.';
  end if;
  if exists (
    select 1 from public.cabin_members m
    where m.cabin_id = new.cabin_id and m.user_id = new.user_id and m.status = 'banned'
  ) then
    raise exception 'You were removed from this cabin and cannot rejoin.';
  end if;
  new.message := nullif(trim(coalesce(new.message, '')), '');
  if new.message is not null and char_length(new.message) > 200 then
    raise exception 'Join messages are capped at 200 characters.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_requests_enforce_insert on public.cabin_join_requests;
create trigger cabin_requests_enforce_insert
  before insert on public.cabin_join_requests
  for each row execute function public.enforce_join_request_insert();

-- CAB-12: only pending → approved/declined, by owner/admin (policy gates the
-- caller; this keeps the state machine intact even for privileged paths).
create or replace function public.enforce_join_request_update()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cabin_id is distinct from old.cabin_id or new.user_id is distinct from old.user_id
     or new.message is distinct from old.message or new.created_at is distinct from old.created_at then
    raise exception 'Join requests cannot be edited.';
  end if;
  if old.status <> 'pending' then
    raise exception 'This request was already handled.';
  end if;
  if new.status not in ('approved', 'declined', 'cancelled') then
    raise exception 'Invalid request status.';
  end if;
  if new.status in ('approved', 'declined') and not public.is_cabin_admin(new.cabin_id) then
    raise exception 'Only the owner or an admin can do that.';
  end if;
  if new.status = 'cancelled' and new.user_id is distinct from (select auth.uid()) then
    raise exception 'You can only cancel your own request.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_requests_enforce_update on public.cabin_join_requests;
create trigger cabin_requests_enforce_update
  before update on public.cabin_join_requests
  for each row execute function public.enforce_join_request_update();

-- CHT-11: ~20 messages/minute per user per cabin.
create or replace function public.enforce_cabin_message_rate()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_recent integer;
begin
  select count(*) into v_recent from public.cabin_messages
  where cabin_id = new.cabin_id and sender_id = new.sender_id
    and created_at > now() - interval '60 seconds';
  if v_recent >= 20 then
    raise exception 'Slow down — cabins allow 20 messages per minute.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_messages_enforce_rate on public.cabin_messages;
create trigger cabin_messages_enforce_rate
  before insert on public.cabin_messages
  for each row execute function public.enforce_cabin_message_rate();

-- CHT-08: soft-delete only; scrub content; no other edits ever.
create or replace function public.enforce_cabin_message_update()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.body is distinct from old.body or new.image_url is distinct from old.image_url
     or new.reply_to is distinct from old.reply_to or new.sender_id is distinct from old.sender_id
     or new.cabin_id is distinct from old.cabin_id or new.created_at is distinct from old.created_at then
    raise exception 'Messages cannot be edited.';
  end if;
  if new.is_deleted and not old.is_deleted then
    new.body := null;
    new.image_url := null;
    if old.sender_id is distinct from (select auth.uid()) and not public.is_cabin_admin(old.cabin_id) then
      raise exception 'Only the sender or a cabin admin can delete a message.';
    end if;
  elsif new.is_deleted is distinct from old.is_deleted then
    raise exception 'Deleted messages cannot be restored.';
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_messages_enforce_update on public.cabin_messages;
create trigger cabin_messages_enforce_update
  before update on public.cabin_messages
  for each row execute function public.enforce_cabin_message_update();

-- CAB-12 / NOT-02: request notifications (owner + admins) and outcomes.
create or replace function public.dispatch_cabin_request_notification()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.cabins where id = new.cabin_id;
  if tg_op = 'INSERT' then
    perform public.notify(v_owner, new.user_id, 'cabin_join_request', 'cabin', new.cabin_id, '{}'::jsonb);
    perform public.notify(m.user_id, new.user_id, 'cabin_join_request', 'cabin', new.cabin_id, '{}'::jsonb)
    from public.cabin_members m
    where m.cabin_id = new.cabin_id and m.role = 'admin' and m.status = 'active';
  elsif new.status = 'approved' and old.status = 'pending' then
    perform public.notify(new.user_id, v_owner, 'cabin_request_approved', 'cabin', new.cabin_id, '{}'::jsonb);
  elsif new.status = 'declined' and old.status = 'pending' then
    perform public.notify(new.user_id, v_owner, 'cabin_request_declined', 'cabin', new.cabin_id, '{}'::jsonb);
  end if;
  return new;
end;
$$;
drop trigger if exists cabin_requests_notify_insert on public.cabin_join_requests;
create trigger cabin_requests_notify_insert
  after insert on public.cabin_join_requests
  for each row execute function public.dispatch_cabin_request_notification();
drop trigger if exists cabin_requests_notify_update on public.cabin_join_requests;
create trigger cabin_requests_notify_update
  after update on public.cabin_join_requests
  for each row when (old.status = 'pending')
  execute function public.dispatch_cabin_request_notification();

-- ------------------------------------------------------------- functions ---

/** CAB-10: join an open cabin. Membership inserts happen only here (plus the
 *  owner auto-insert), so every limit/ban trigger sees the attempt. */
create or replace function public.join_cabin(p_cabin uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_type text; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;
  select type into v_type from public.cabins where id = p_cabin;
  if v_type is null then
    raise exception 'Cabin not found.';
  end if;
  if v_type <> 'open' then
    raise exception 'This cabin requires approval — send a request instead.';
  end if;
  insert into public.cabin_members (cabin_id, user_id) values (p_cabin, v_uid);
  return p_cabin;
end;
$$;

/** CAB-12: owner/admin approves a pending request (member insert + status). */
create or replace function public.approve_join_request(p_request uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_row public.cabin_join_requests%rowtype;
begin
  select * into v_row from public.cabin_join_requests where id = p_request;
  if not found then
    raise exception 'Request not found.';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This request was already handled.';
  end if;
  if not public.is_cabin_admin(v_row.cabin_id) then
    raise exception 'Only the owner or an admin can approve requests.';
  end if;
  insert into public.cabin_members (cabin_id, user_id)
  values (v_row.cabin_id, v_row.user_id);
  update public.cabin_join_requests set status = 'approved' where id = p_request;
  return v_row.cabin_id;
end;
$$;

/** CAB-13: ownership transfer — caller must be the current owner; the new
 *  owner must be an active member. Role swap fires the single-owner trigger
 *  (previous owner demoted to admin), then cabins.owner_id follows. */
create or replace function public.transfer_cabin_ownership(p_cabin uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.cabin_members m
    where m.cabin_id = p_cabin and m.user_id = (select auth.uid()) and m.role = 'owner'
  ) then
    raise exception 'Only the current owner can transfer ownership.';
  end if;
  if not exists (
    select 1 from public.cabin_members m
    where m.cabin_id = p_cabin and m.user_id = p_new_owner and m.status = 'active'
  ) then
    raise exception 'The new owner must be an active member of this cabin.';
  end if;
  update public.cabin_members set role = 'owner'
  where cabin_id = p_cabin and user_id = p_new_owner; -- demotes the old owner via trigger
  update public.cabins set owner_id = p_new_owner where id = p_cabin;
end;
$$;

-- ------------------------------------------------------------------- RLS ---

alter table public.cabins enable row level security;
alter table public.cabin_interests enable row level security;
alter table public.cabin_members enable row level security;
alter table public.cabin_join_requests enable row level security;
alter table public.cabin_messages enable row level security;

-- cabins: browse all (request cabins stay discoverable — §14 Q4 default);
-- create as self; edit owner/admin; delete owner only.
drop policy if exists "cabins_select" on public.cabins;
create policy cabins_select on public.cabins
  for select to authenticated using (true);
drop policy if exists "cabins_insert" on public.cabins;
create policy cabins_insert on public.cabins
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "cabins_update" on public.cabins;
create policy cabins_update on public.cabins
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_cabin_admin(id))
  with check (owner_id = (select auth.uid()) or public.is_cabin_admin(id));
drop policy if exists "cabins_delete" on public.cabins;
create policy cabins_delete on public.cabins
  for delete to authenticated using (owner_id = (select auth.uid()));

-- cabin_interests: browse for discovery/filter; write = cabin owner/admin.
drop policy if exists "cabin_interests_select" on public.cabin_interests;
create policy cabin_interests_select on public.cabin_interests
  for select to authenticated using (true);
drop policy if exists "cabin_interests_insert" on public.cabin_interests;
create policy cabin_interests_insert on public.cabin_interests
  for insert to authenticated with check (public.is_cabin_admin(cabin_id));
drop policy if exists "cabin_interests_delete" on public.cabin_interests;
create policy cabin_interests_delete on public.cabin_interests
  for delete to authenticated using (public.is_cabin_admin(cabin_id));

-- cabin_members: reads need cabin membership (member lists are member-only;
-- discovery uses cabins.member_count instead — see docs/audit/cabins.md).
-- No INSERT policy on purpose: joins only via join_cabin/approve_join_request.
-- Update: own row (muted/last_read_at) or owner/admin (role/status via the
-- trigger-guarded path). Delete: own leave or owner/admin removal.
drop policy if exists "cabin_members_select" on public.cabin_members;
create policy cabin_members_select on public.cabin_members
  for select to authenticated using (public.is_cabin_member(cabin_id, (select auth.uid())));
drop policy if exists "cabin_members_update" on public.cabin_members;
create policy cabin_members_update on public.cabin_members
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_cabin_admin(cabin_id))
  with check (user_id = (select auth.uid()) or public.is_cabin_admin(cabin_id));
drop policy if exists "cabin_members_delete" on public.cabin_members;
create policy cabin_members_delete on public.cabin_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_cabin_admin(cabin_id));

-- cabin_join_requests: own rows + cabin owner/admin see them; insert own
-- pending (trigger checks type/ban/membership); update by owner/admin
-- (approve/decline, state machine in trigger); cancel = own delete.
drop policy if exists "cabin_requests_select" on public.cabin_join_requests;
create policy cabin_requests_select on public.cabin_join_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_cabin_admin(cabin_id));
drop policy if exists "cabin_requests_insert" on public.cabin_join_requests;
create policy cabin_requests_insert on public.cabin_join_requests
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "cabin_requests_update" on public.cabin_join_requests;
create policy cabin_requests_update on public.cabin_join_requests
  for update to authenticated
  using (public.is_cabin_admin(cabin_id) or user_id = (select auth.uid()))
  with check (true);
drop policy if exists "cabin_requests_delete" on public.cabin_join_requests;
create policy cabin_requests_delete on public.cabin_join_requests
  for delete to authenticated using (user_id = (select auth.uid()));

-- cabin_messages: active members read/write; sender or admin soft-deletes;
-- no hard delete (default deny).
drop policy if exists "cabin_messages_select" on public.cabin_messages;
create policy cabin_messages_select on public.cabin_messages
  for select to authenticated
  using (public.is_cabin_member(cabin_id, (select auth.uid())));
drop policy if exists "cabin_messages_insert" on public.cabin_messages;
create policy cabin_messages_insert on public.cabin_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_cabin_member(cabin_id, (select auth.uid()))
  );
drop policy if exists "cabin_messages_update" on public.cabin_messages;
create policy cabin_messages_update on public.cabin_messages
  for update to authenticated
  using (
    sender_id = (select auth.uid())
    or public.is_cabin_admin(cabin_id)
    or public.is_admin((select auth.uid()))  -- CHT-12: platform moderation queue can remove
  )
  with check (
    sender_id = (select auth.uid())
    or public.is_cabin_admin(cabin_id)
    or public.is_admin((select auth.uid()))
  );

-- CHT-12: extend the reports check constraint to cover cabins and cabin messages.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post','comment','user','cabin','cabin_message'));

-- --------------------------------------------------------------- grants ---

grant select on public.cabins to authenticated;
grant insert, update, delete on public.cabins to authenticated;
grant select on public.cabin_interests to authenticated;
grant insert, delete on public.cabin_interests to authenticated;
grant select on public.cabin_members to authenticated;
grant update, delete on public.cabin_members to authenticated;
grant select, insert, update, delete on public.cabin_join_requests to authenticated;
grant select, insert, update on public.cabin_messages to authenticated;
-- RPC entry points (membership only enters the table through these).
grant execute on function public.join_cabin(uuid) to authenticated;
grant execute on function public.approve_join_request(uuid) to authenticated;
grant execute on function public.transfer_cabin_ownership(uuid, uuid) to authenticated;
-- Policy helpers (default PUBLIC execute would suffice; explicit for clarity).
grant execute on function public.is_cabin_admin(uuid) to authenticated;
grant execute on function public.is_cabin_member(uuid, uuid) to authenticated;

-- Realtime (CHT-01): group chat streams per-cabin postgres_changes events.
do $$
begin
  alter publication supabase_realtime add table public.cabin_messages;
exception
  when duplicate_object or undefined_object then null;
end $$;

commit;
