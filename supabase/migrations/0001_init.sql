-- Circle — initial schema, triggers, RPCs, and Row-Level Security
-- Derived from PRD-social-media-app.md §6 (v1.0).
-- Apply with: supabase db push  (or paste into the SQL editor)
--
-- RLS is ENABLED on every table; policies follow the matrix in §6.4.
-- Identity of the caller is always auth.uid() (Supabase Auth / Google OAuth).

-- =========================================================================
-- 6.2 Schema
-- =========================================================================

-- Profiles (1:1 with auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 50),
  bio text check (char_length(bio) <= 160),
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on profiles (lower(username));

-- Posts
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  image_urls text[] not null default '{}' check (cardinality(image_urls) <= 4),
  like_count int not null default 0,
  comment_count int not null default 0,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index posts_author_created_idx on posts (author_id, created_at desc);
create index posts_created_idx on posts (created_at desc) where deleted_at is null;

-- Comments
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index comments_post_idx on comments (post_id, created_at);

-- Likes (N—N profiles × posts, one like per user per post)
create table likes (
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- Follows (N—N profiles × profiles)
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on follows (following_id);

-- Blocks (N—N profiles × profiles)
create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('follow','like','comment')),
  post_id uuid references posts(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on notifications (recipient_id, created_at desc);

-- Reports (target_type discriminator: post | comment | user)
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','harassment','hate','nsfw','other')),
  details text,
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  created_at timestamptz not null default now()
);
create index reports_status_idx on reports (status, created_at desc);

-- =========================================================================
-- 6.3 Triggers & Functions
-- =========================================================================

-- Handle new user: copy Google metadata into profiles on first sign-in (AUTH-2).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    null,  -- username is chosen during onboarding
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Denormalized counters (ENG-4 near-real-time counts).
create or replace function public.update_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger likes_count_trigger
  after insert or delete on likes
  for each row execute function public.update_like_count();

create or replace function public.update_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger comments_count_trigger
  after insert or delete on comments
  for each row execute function public.update_comment_count();

-- Notifications on follow / like / comment (skip self-notification).
create or replace function public.create_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recipient uuid;
  v_post uuid;
begin
  if tg_table_name = 'follows' then
    v_recipient := new.following_id;
    v_post := null;
  elsif tg_table_name = 'likes' then
    select author_id into v_recipient from posts where id = new.post_id;
    v_post := new.post_id;
  elsif tg_table_name = 'comments' then
    select author_id into v_recipient from posts where id = new.post_id;
    v_post := new.post_id;
  end if;

  if v_recipient is null or v_recipient = auth.uid() then
    return new;  -- no self-notifications
  end if;

  insert into notifications (recipient_id, actor_id, type, post_id)
  values (v_recipient, auth.uid(), tg_table_name::text, v_post);
  return new;
end;
$$;

create trigger notifications_on_follow after insert on follows
  for each row execute function public.create_notification();
create trigger notifications_on_like after insert on likes
  for each row execute function public.create_notification();
create trigger notifications_on_comment after insert on comments
  for each row execute function public.create_notification();

-- Following feed RPC (FEED-1): cursor pagination, excludes blocked users,
-- suspended authors, and soft-deleted posts.
create or replace function public.get_following_feed(
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_limit int default 20
)
returns setof posts
language sql
stable
security invoker
set search_path = public
as $$
  select p.*
  from posts p
  where p.deleted_at is null
    and (p.author_id = auth.uid()
         or p.author_id in (select following_id from follows where follower_id = auth.uid()))
    and p.author_id <> all (
          select case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end
          from blocks b where b.blocker_id = auth.uid() or b.blocked_id = auth.uid()
        )
    and not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_suspended)
    and (cursor_created_at is null
         or p.created_at < cursor_created_at
         or (p.created_at = cursor_created_at and p.id < cursor_id))
  order by p.created_at desc, p.id desc
  limit least(page_limit, 50);
$$;

-- =========================================================================
-- 6.4 Row-Level Security (enabled on EVERY table)
-- =========================================================================

alter table profiles       enable row level security;
alter table posts          enable row level security;
alter table comments       enable row level security;
alter table likes          enable row level security;
alter table follows        enable row level security;
alter table blocks         enable row level security;
alter table notifications  enable row level security;
alter table reports        enable row level security;

-- profiles -----------------------------------------------------------------
create policy "profiles_select_authenticated"
  on profiles for select to authenticated using (true);
create policy "profiles_insert_trigger_only"
  on profiles for insert to authenticated with check (false);  -- via handle_new_user (definer)
create policy "profiles_update_own"
  on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete_own"
  on profiles for delete to authenticated using (id = auth.uid());

-- posts --------------------------------------------------------------------
create policy "posts_select_not_deleted"
  on posts for select to authenticated
  using (
    deleted_at is null
    and author_id <> all (  -- blocked users see neither direction (FEED-4)
      select case when b.blocker_id = auth.uid() then b.blocked_id else b.blocker_id end
      from blocks b where b.blocker_id = auth.uid() or b.blocked_id = auth.uid()
    )
  );
create policy "posts_insert_own"
  on posts for insert to authenticated
  with check (author_id = auth.uid());
create policy "posts_update_own"
  on posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "posts_delete_own_or_admin"
  on posts for delete to authenticated
  using (author_id = auth.uid()
         or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- comments -----------------------------------------------------------------
create policy "comments_select"
  on comments for select to authenticated using (true);
create policy "comments_insert_own"
  on comments for insert to authenticated
  with check (author_id = auth.uid());
create policy "comments_delete_owner_or_admin"
  on comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from posts po where po.id = post_id and po.author_id = auth.uid())
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- likes --------------------------------------------------------------------
create policy "likes_select"
  on likes for select to authenticated using (true);
create policy "likes_insert_own"
  on likes for insert to authenticated
  with check (user_id = auth.uid());
create policy "likes_delete_own"
  on likes for delete to authenticated using (user_id = auth.uid());

-- follows ------------------------------------------------------------------
create policy "follows_select"
  on follows for select to authenticated using (true);
create policy "follows_insert_own"
  on follows for insert to authenticated
  with check (follower_id = auth.uid() and follower_id <> following_id);
create policy "follows_delete_own"
  on follows for delete to authenticated using (follower_id = auth.uid());

-- blocks -------------------------------------------------------------------
create policy "blocks_select_own_rows"
  on blocks for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());
create policy "blocks_insert_own"
  on blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);
create policy "blocks_delete_own"
  on blocks for delete to authenticated using (blocker_id = auth.uid());

-- notifications ------------------------------------------------------------
create policy "notifications_select_own"
  on notifications for select to authenticated using (recipient_id = auth.uid());
create policy "notifications_update_own"
  on notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "notifications_delete_own"
  on notifications for delete to authenticated using (recipient_id = auth.uid());
-- insert: only the security-definer function (create_notification) writes rows.

-- reports ------------------------------------------------------------------
create policy "reports_select_admin"
  on reports for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "reports_insert_authenticated"
  on reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "reports_update_admin"
  on reports for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "reports_delete_admin"
  on reports for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- =========================================================================
-- 6.5 Storage buckets (avatars, post-images)
-- Run once per environment. (Dashboard-created buckets work too.)
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('post-images', 'post-images', true)
on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_owner_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "post_images_public_read"
  on storage.objects for select using (bucket_id = 'post-images');
create policy "post_images_owner_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and pg_input_is_valid(coalesce(content_type, ''), 'mime')  -- image MIME types only
  );
create policy "post_images_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
