-- 0011_dm_policy_fix.sql — fix RLS variable shadowing in DM policies
--
-- Bug: inside `exists (select ... from conversation_members cm
--      where cm.conversation_id = conversation_id ...)` the bare
--      `conversation_id` resolves to the *alias* (cm.conversation_id),
--      NOT the row being inserted/selected — so the conditions compare
--      a column against itself and degenerate:
--        * conversation_members_insert_member "creator" branch became
--          "is the conversation_members table globally empty" — false once
--          anyone has messaged, so every BRAND-NEW user was RLS-denied on
--          their first DM ("You do not have permission to do that.").
--        * messages_select_member / update / insert checks became
--          "member of ANY conversation" instead of "member of THIS one"
--          (permissive for inserts, wrong for reads/updates).
--        * the 0006 dm_permission gate inside messages_insert had the
--          same shadowing inside its subqueries.
--
-- Fix: replace bare-column correlations with SECURITY DEFINER helper
-- functions taking explicit parameters — no alias can shadow them — and
-- re-create the four affected policies. Idempotent; safe to re-run.

-- ---------------------------------------------------------------- helpers --
create or replace function public.circle_is_conv_member(cid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = cid
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.circle_conv_member_count(cid uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.conversation_members m
  where m.conversation_id = cid;
$$;

-- any participant (other than the caller) blocked in either direction
create or replace function public.circle_conv_blocked(cid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.conversation_members m
    join public.blocks b
      on (b.blocker_id = (select auth.uid()) and b.blocked_id = m.user_id)
      or (b.blocker_id = m.user_id and b.blocked_id = (select auth.uid()))
    where m.conversation_id = cid
      and m.user_id <> (select auth.uid())
  );
$$;

-- PRV-05/07: may `sender` 1:1-message `recipient`? Requires the recipient's
-- profile to exist (a missing row cannot grant consent), no block either
-- way, and dm_permission to admit the sender (everyone, or followers with
-- an accepted follow). Groups/cabins never consult this.
create or replace function public.circle_dm_permits(sender uuid, recipient uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = recipient
      and p.dm_permission <> 'nobody'
      and (
        p.dm_permission = 'everyone'
        or exists (
          select 1 from public.follows f
          where f.follower_id = sender
            and f.following_id = recipient
            and f.status = 'accepted'
        )
      )
  )
  and not exists (
    select 1 from public.blocks b
    where (b.blocker_id = sender and b.blocked_id = recipient)
       or (b.blocker_id = recipient and b.blocked_id = sender)
  );
$$;

-- per-conversation dm gate used when SENDING a message in a 1:1 thread:
-- every other member's dm_permission must admit the sender
create or replace function public.circle_conv_dm_ok(cid uuid, sender uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
    where m.conversation_id = cid
      and m.user_id <> sender
      and (
        p.dm_permission = 'nobody'
        or (p.dm_permission = 'followers'
            and not exists (
              select 1 from public.follows f
              where f.follower_id = sender
                and f.following_id = m.user_id
                and f.status = 'accepted'
            ))
      )
  );
$$;

-- ------------------------------------------------------------- policies --
-- conversations ------------------------------------------------------------

drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member"
  on public.conversations for select to authenticated
  using (public.circle_is_conv_member(id));

drop policy if exists "conversations_insert_authenticated" on public.conversations;
create policy "conversations_insert_authenticated"
  on public.conversations for insert to authenticated
  with check (true);

-- conversation_members ------------------------------------------------------

drop policy if exists "conversation_members_select" on public.conversation_members;
create policy "conversation_members_select"
  on public.conversation_members for select to authenticated
  using (true);

drop policy if exists "conversation_members_insert_member" on public.conversation_members;
create policy "conversation_members_insert_member"
  on public.conversation_members for insert to authenticated
  with check (
    (
      public.circle_is_conv_member(conversation_id)          -- already joined
      or public.circle_conv_member_count(conversation_id) = 0 -- creator opens the thread
    )
    and (user_id = (select auth.uid())                       -- adding myself: always fine
         or public.circle_conv_member_count(conversation_id) > 1  -- group thread
         or public.circle_dm_permits((select auth.uid()), user_id))  -- PRV-05/07 1:1 gate
  );

-- messages ------------------------------------------------------------------

drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member"
  on public.messages for select to authenticated
  using (public.circle_is_conv_member(conversation_id));

drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.circle_is_conv_member(conversation_id)
    and not public.circle_conv_blocked(conversation_id)      -- PRV-07 blocks
    and (
      public.circle_conv_member_count(conversation_id) > 2   -- group thread skips the 1:1 gate
      or public.circle_conv_dm_ok(conversation_id, (select auth.uid()))  -- PRV-05 1:1 gate
    )
  );

drop policy if exists "messages_update_read_own" on public.messages;
create policy "messages_update_read_own"
  on public.messages for update to authenticated
  using (public.circle_is_conv_member(conversation_id))
  with check (public.circle_is_conv_member(conversation_id));
