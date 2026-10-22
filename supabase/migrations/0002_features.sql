-- Circle — v2 feature expansion (PLAN.md §5)
--   F-REP reposts · F-SAV saves · F-STO stories · F-DM direct messages
--   F-VID video posts · F-CMI photos in comments · F-HAS hashtags
-- Apply after 0001_init.sql: supabase db push

-- =========================================================================
-- F-VID + F-HAS + F-REP — posts gains video, hashtags, repost counter
-- =========================================================================

-- Video XOR photos: at most one video_url, and a post needs body or media.
alter table posts
  add column if not exists video_url text,
  add column if not exists repost_count int not null default 0,
  add column if not exists hashtags text[] not null default '{}';

alter table posts drop constraint if exists posts_body_check;
alter table posts
  add constraint posts_body_or_media_check check (
    char_length(body) <= 500
    and (char_length(body) > 0 or cardinality(image_urls) > 0 or video_url is not null)
  );
alter table posts drop constraint if exists posts_video_single_check;
alter table posts
  add constraint posts_video_xor_images_check check (
    video_url is null or cardinality(image_urls) = 0
  );

create index if not exists posts_hashtags_gin_idx on posts using gin (hashtags);
create index if not exists posts_created_at_live_idx on posts (created_at desc) where deleted_at is null;

-- =========================================================================
-- F-CMI — photos in comments (≤2, body optional when a photo exists)
-- =========================================================================

alter table comments
  add column if not exists image_urls text[] not null default '{}' check (cardinality(image_urls) <= 2);

alter table comments drop constraint if exists comments_body_check;
alter table comments
  add constraint comments_body_or_image_check check (
    char_length(body) <= 300
    and (char_length(body) > 0 or cardinality(image_urls) > 0)
  );

-- =========================================================================
-- Notifications — repost type (F-REP)
-- =========================================================================

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications
  add constraint notifications_type_check check (type in ('follow','like','comment','repost'));

-- =========================================================================
-- F-REP — reposts
-- =========================================================================

create table if not exists reposts (
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id),
  check (user_id <> (select author_id from posts where id = post_id))  -- no self-repost
);
create index if not exists reposts_post_idx on reposts (post_id, created_at desc);

create or replace function public.update_repost_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set repost_count = repost_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update posts set repost_count = greatest(repost_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists reposts_count_trigger on reposts;
create trigger reposts_count_trigger
  after insert or delete on reposts
  for each row execute function public.update_repost_count();

-- notification on repost
create or replace function public.repost_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recipient uuid;
begin
  select author_id into v_recipient from posts where id = new.post_id;
  if v_recipient is not null and v_recipient <> auth.uid() then
    insert into notifications (recipient_id, actor_id, type, post_id)
    values (v_recipient, auth.uid(), 'repost', new.post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_on_repost on reposts;
create trigger notifications_on_repost after insert on reposts
  for each row execute function public.repost_notification();

alter table reposts enable row level security;
create policy "reposts_select" on reposts for select to authenticated using (true);
create policy "reposts_insert_own" on reposts for insert to authenticated
  with check (user_id = auth.uid());
create policy "reposts_delete_own" on reposts for delete to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- F-SAV — private bookmarks
-- =========================================================================

create table if not exists saves (
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists saves_user_idx on saves (user_id, created_at desc);

alter table saves enable row level security;
-- Saves are private: only the owner can see (and therefore list) them.
create policy "saves_select_own" on saves for select to authenticated
  using (user_id = auth.uid());
create policy "saves_insert_own" on saves for insert to authenticated
  with check (user_id = auth.uid());
create policy "saves_delete_own" on saves for delete to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- F-STO — ephemeral stories (24 h TTL)
-- =========================================================================

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('image','video','text')),
  media text,               -- storage path or data URL; null for text stories
  caption text not null default '' check (char_length(caption) <= 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check ((kind = 'text') = (media is null))
);
create index if not exists stories_live_idx on stories (user_id, created_at desc)
  where expires_at > now();

alter table stories enable row level security;
create policy "stories_select_live"
  on stories for select to authenticated
  using (
    expires_at > now()
    and user_id <> all (  -- blocks hide stories both ways (F-SAF)
      select case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end
      from blocks b where b.blocker_id = auth.uid() or b.blocked_id = auth.uid()
    )
  );
create policy "stories_insert_own"
  on stories for insert to authenticated
  with check (user_id = auth.uid() and expires_at <= now() + interval '25 hours');
create policy "stories_delete_own_or_admin"
  on stories for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Hard purge of expired stories. With pg_cron (Supabase dashboard → Extensions):
--   select cron.schedule('purge-stories', '17 * * * *', $$delete from stories where expires_at < now()$$);
-- Without pg_cron, run the DELETE from a scheduled Edge Function instead.
create or replace function public.purge_expired_stories()
returns void language sql security definer set search_path = public as $$
  delete from stories where expires_at < now();
$$;

-- =========================================================================
-- F-DM — direct messaging (1:1 in MVP; members table allows group DMs later)
-- =========================================================================

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on conversation_members (user_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 1000),
  media_kind text check (media_kind in ('image','video')),
  media text,
  post_id uuid references posts(id) on delete set null,  -- shared post attach
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (char_length(body) > 0 or media is not null or post_id is not null),
  check ((media_kind is null) = (media is null))
);
create index if not exists messages_conv_idx on messages (conversation_id, created_at);

alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

-- Participants see their conversations; membership is the gate for messages.
create policy "conversations_select_member"
  on conversations for select to authenticated
  using (exists (
    select 1 from conversation_members cm
    where cm.conversation_id = id and cm.user_id = auth.uid()
  ));
create policy "conversations_insert_authenticated"
  on conversations for insert to authenticated with check (true);

create policy "conversation_members_select"
  on conversation_members for select to authenticated using (true);
create policy "conversation_members_insert_member"
  on conversation_members for insert to authenticated
  with check (
    exists (select 1 from conversation_members cm
            where cm.conversation_id = conversation_id and cm.user_id = auth.uid())
    or not exists (select 1 from conversation_members cm2 where cm2.conversation_id = conversation_id)  -- creator
  );

create policy "messages_select_member"
  on messages for select to authenticated
  using (exists (
    select 1 from conversation_members cm
    where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
  ));
create policy "messages_insert_member"
  on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_members cm
      where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
    )
    -- block enforcement: no messaging someone you blocked or who blocked you
    and not exists (
      select 1 from conversation_members cm2
      join blocks b on (
        (b.blocker_id = auth.uid() and b.blocked_id = cm2.user_id)
        or (b.blocker_id = cm2.user_id and b.blocked_id = auth.uid())
      )
      where cm2.conversation_id = conversation_id and cm2.user_id <> auth.uid()
    )
  );
create policy "messages_update_read_own"
  on messages for update to authenticated
  using (exists (
    select 1 from conversation_members cm
    where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
  ));

-- =========================================================================
-- FEED-1 v2 — following feed including repost entries (F-REP)
-- =========================================================================

create or replace function public.get_home_feed(
  cursor_ts timestamptz default null,
  cursor_id uuid default null,
  page_limit int default 20
)
returns table (post jsonb, reposter_id uuid, reposted_at timestamptz)
language sql stable security invoker set search_path = public
as $$
  with blocked as (
    select case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end as uid
    from blocks b where b.blocker_id = auth.uid() or b.blocked_id = auth.uid()
  ),
  following as (
    select following_id as uid from follows where follower_id = auth.uid()
    union select auth.uid()
  ),
  base as (
    select p.* as post_row, null::uuid as reposter, null::timestamptz as reposted, p.created_at as ts
    from posts p
    where p.deleted_at is null and p.author_id in (select uid from following)
      and p.author_id <> all (select uid from blocked)
      and not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_suspended)
    union all
    select p.*, r.user_id, r.created_at, r.created_at
    from reposts r
    join posts p on p.id = r.post_id
    where r.user_id in (select uid from following)
      and p.deleted_at is null
      and p.author_id <> all (select uid from blocked)
      and not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_suspended)
  ),
  dedup as (  -- one entry per post: later event (repost vs original) wins
    select distinct on (post_row.id) * from base
    order by post_row.id, ts desc
  )
  select to_jsonb(d.post_row) as post, d.reposter, d.reposted
  from dedup d
  where (cursor_ts is null or d.ts < cursor_ts or (d.ts = cursor_ts and d.post_row.id < cursor_id))
  order by d.ts desc, d.post_row.id desc
  limit least(page_limit, 50);
$$;

-- =========================================================================
-- F-HAS — trending hashtags (last 7 days)
-- =========================================================================

create or replace function public.get_trending_hashtags(top_n int default 10)
returns table (tag text, count bigint)
language sql stable security invoker set search_path = public
as $$
  select t as tag, count(*) as count
  from posts p, unnest(p.hashtags) as t
  where p.deleted_at is null
    and p.created_at > now() - interval '7 days'
    and p.author_id <> all (
      select case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end
      from blocks b where b.blocker_id = auth.uid() or b.blocked_id = auth.uid()
    )
  group by t
  order by count desc, t asc
  limit least(top_n, 25);
$$;

-- =========================================================================
-- F-VID storage — video bucket (≤10 MB, mp4/webm/mov)
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media_public_read"
  on storage.objects for select using (bucket_id = 'media');
create policy "media_owner_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(content_type, '') in ('video/mp4', 'video/webm', 'video/quicktime')
  );
create policy "media_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================================
-- F-RT — Supabase Realtime wiring
-- Clients subscribe to these tables after auth:
--   channel('rt:me:<uid>').on('postgres_changes', {event:'INSERT', table:'notifications'})
--   channel('rt:conv:<id>').on('postgres_changes', {event:'*', table:'messages', filter:`conversation_id=eq.${id}`})
-- =========================================================================

alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table likes;
alter publication supabase_realtime add table reposts;
alter publication supabase_realtime add table follows;
