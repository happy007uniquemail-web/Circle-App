-- 0013_message_reply_continuity.sql — always allow replies in an existing thread
--
-- The messages_insert_member gate re-evaluated the 1:1 dm_permission on
-- EVERY send. A participant could create a thread and receive a message,
-- then have their own REPLY denied because the other side's dm_permission
-- changed mid-thread (or their follow row wasn't 'accepted'). Replies in an
-- already-active thread must always flow — refusal belongs at thread
-- creation, not per keystroke. Blocks (either direction) remain enforced
-- unconditionally above the gate. Idempotent; safe to re-run.

drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.circle_is_conv_member(conversation_id)
    and not public.circle_conv_blocked(conversation_id)
    and (
      public.circle_conv_member_count(conversation_id) > 2        -- group thread
      or public.circle_conv_dm_ok(conversation_id, (select auth.uid()))  -- PRV-05 gate
      or exists (                                                  -- continuity:
        select 1 from public.messages mo                           -- a thread with
        where mo.conversation_id = conversation_id                -- any prior message
      )                                                            -- is open to replies
    )
  );
