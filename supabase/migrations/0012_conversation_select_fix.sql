-- 0012_conversation_select_fix.sql — allow reading a conversation at creation
--
-- startConversation() does insert().select().single() on `conversations`.
-- At that instant the row has ZERO members, so the member-only SELECT
-- policy hid the row from its own creator and PostgREST reported a
-- row-level-security error — DMs were denied before any member row could
-- even be written. An empty conversation carries no data (membership rows
-- and message policies still gate everything), so letting anyone select
-- an empty conversation is safe: it can only be a thread someone just
-- opened, and only its future members' numbers can match it again.
-- Idempotent; safe to re-run.

drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member"
  on public.conversations for select to authenticated
  using (
    public.circle_is_conv_member(id)
    or public.circle_conv_member_count(id) = 0  -- fresh thread, creator's RETURNING build
  );
