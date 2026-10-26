-- 0014: Story interactions (F-STO2)
--   * Emoji reactions on stories (incl. the ❤️ heart reaction)
--   * Comments on stories
--   * Story reposts (repost_of column: a repost is a new story row owning
--     attr: attribution + optionally re-uploaded media)
--   * Notifications for story reactions/comments (`notify()` + triggers)

-- ------------------------------------------------------------------ reactions
create table if not exists story_reactions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  unique (story_id, user_id, emoji)
);
create index if not exists story_reactions_story_idx on story_reactions (story_id);

-- ------------------------------------------------------------------- comments
create table if not exists story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists story_comments_story_idx on story_comments (story_id, created_at);

-- -------------------------------------------------------------------- reposts
alter table public.stories add column if not exists repost_of uuid references public.stories(id) on delete set null;

-- ------------------------------------------------------------------------ RLS
alter table public.story_reactions enable row level security;
alter table public.story_comments enable row level security;

create policy "story_reactions_select"
  on story_reactions for select to authenticated
  using (true);

create policy "story_reactions_insert_own"
  on story_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.stories s
      where s.id = story_id
        and s.expires_at > now()
        -- can't react to someone who blocked you (mirror of stories_select_live)
        and s.user_id <> all (
          select case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end
          from blocks b where b.blocker_id = auth.uid() or b.blocked_id = auth.uid()
        )
    )
  );

create policy "story_reactions_delete_own"
  on story_reactions for delete to authenticated
  using (user_id = auth.uid());

create policy "story_comments_select"
  on story_comments for select to authenticated
  using (true);

create policy "story_comments_insert_own"
  on story_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.stories s
      where s.id = story_id
        and s.expires_at > now()
        and s.user_id <> all (
          select case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end
          from blocks b where b.blocker_id = auth.uid() or b.blocked_id = auth.uid()
        )
    )
  );

-- The comment author, the story owner, or an admin may remove one.
create policy "story_comments_delete_owners"
  on story_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- -------------------------------------------------------------- notifications
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'follow','like','comment','repost','mention',
  'follow_request','follow_request_approved',
  'cabin_join_request','cabin_request_approved','cabin_request_declined','cabin_invite',
  'story_reaction','story_comment'
));

create or replace function notify_story_reaction() returns trigger
language plpgsql as $$
declare s record;
begin
  select user_id into s from public.stories where id = new.story_id;
  if s is not null then
    perform notify(s.user_id, new.user_id, 'story_reaction', 'story', new.story_id,
      jsonb_build_object('story_id', new.story_id, 'emoji', new.emoji));
  end if;
  return new;
end $$;

drop trigger if exists story_reactions_notify on story_reactions;
create trigger story_reactions_notify
  after insert on story_reactions
  for each row execute function notify_story_reaction();

create or replace function notify_story_comment() returns trigger
language plpgsql as $$
declare s record;
begin
  select user_id into s from public.stories where id = new.story_id;
  if s is not null then
    perform notify(s.user_id, new.author_id, 'story_comment', 'story', new.story_id,
      jsonb_build_object('story_id', new.story_id, 'comment_id', new.id));
  end if;
  return new;
end $$;

drop trigger if exists story_comments_notify on story_comments;
create trigger story_comments_notify
  after insert on story_comments
  for each row execute function notify_story_comment();

-- ------------------------------------------------------------------ realtime
do $$ begin
  alter publication supabase_realtime add table story_reactions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table story_comments;
exception when duplicate_object then null; end $$;
