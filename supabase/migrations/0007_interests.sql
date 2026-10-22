-- 0007_interests.sql — Workstream F (INT-01, INT-02, INT-03, INT-09)
-- Curated interest catalog, per-user selections, the server-side 3–10 range
-- (client mirrors it for UX; the trigger is authoritative), and the indexes
-- that cabin/people suggestions (INT-07, Workstream G) will lean on.
--
-- Enforcement scope (see docs/audit/interests.md):
--   * INT-03 min 3 is an onboarding-flow rule (skippable by design), so it
--     lives in the picker UI; the max 10 is enforced here in the DB.
--   * INT-08 (custom interest proposals) is the TRD's optional item — deferred.

begin;

-- INT-01: curated catalog ---------------------------------------------------
create table if not exists public.interests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.interests enable row level security;

-- Inactive rows (future INT-08 proposals) stay invisible to clients; the
-- admin tooling reads them via the service role, which bypasses RLS.
drop policy if exists "interests_select_active" on public.interests;
create policy interests_select_active on public.interests
  for select to authenticated
  using (is_active);

grant select on public.interests to authenticated;

insert into public.interests (slug, name, category) values
  ('drawing', 'Drawing', 'Art'),
  ('painting', 'Painting', 'Art'),
  ('photography', 'Photography', 'Art'),
  ('sculpture', 'Sculpture', 'Art'),
  ('indie-music', 'Indie', 'Music'),
  ('hip-hop', 'Hip-hop', 'Music'),
  ('classical', 'Classical', 'Music'),
  ('live-music', 'Live music', 'Music'),
  ('web-dev', 'Web dev', 'Tech'),
  ('artificial-intelligence', 'AI', 'Tech'),
  ('gadgets', 'Gadgets', 'Tech'),
  ('open-source', 'Open source', 'Tech'),
  ('football', 'Football', 'Sports'),
  ('basketball', 'Basketball', 'Sports'),
  ('running', 'Running', 'Sports'),
  ('swimming', 'Swimming', 'Sports'),
  ('fiction', 'Fiction', 'Books'),
  ('fantasy', 'Fantasy', 'Books'),
  ('nonfiction', 'Non-fiction', 'Books'),
  ('poetry', 'Poetry', 'Books'),
  ('pc-gaming', 'PC gaming', 'Gaming'),
  ('console-gaming', 'Console gaming', 'Gaming'),
  ('board-games', 'Board games', 'Gaming'),
  ('esports', 'Esports', 'Gaming'),
  ('backpacking', 'Backpacking', 'Travel'),
  ('road-trips', 'Road trips', 'Travel'),
  ('city-breaks', 'City breaks', 'Travel'),
  ('hiking', 'Hiking', 'Travel'),
  ('baking', 'Baking', 'Food'),
  ('coffee', 'Coffee', 'Food'),
  ('vegan-cooking', 'Vegan cooking', 'Food'),
  ('street-food', 'Street food', 'Food'),
  ('space', 'Space', 'Science'),
  ('biology', 'Biology', 'Science'),
  ('physics', 'Physics', 'Science'),
  ('environment', 'Environment', 'Science'),
  ('yoga', 'Yoga', 'Fitness'),
  ('weightlifting', 'Weightlifting', 'Fitness'),
  ('cycling', 'Cycling', 'Fitness'),
  ('climbing', 'Climbing', 'Fitness'),
  ('scifi', 'Sci-fi', 'Movies'),
  ('drama', 'Drama', 'Movies'),
  ('horror', 'Horror', 'Movies'),
  ('animation', 'Animation', 'Movies'),
  ('languages', 'Languages', 'Learning'),
  ('history', 'History', 'Learning'),
  ('psychology', 'Psychology', 'Learning'),
  ('finance', 'Finance', 'Learning')
on conflict (slug) do nothing;

-- INT-02: per-user selections ------------------------------------------------
create table if not exists public.user_interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, interest_id)
);

-- INT-09: suggestion lookups read by user and by interest.
create index if not exists user_interests_user_idx on public.user_interests (user_id);
create index if not exists user_interests_interest_idx on public.user_interests (interest_id);

alter table public.user_interests enable row level security;

-- Rows are just (user, interest) pairs — non-sensitive, and needed to match
-- viewers against other people for suggestions. PRV-04's show_interests
-- governs *display* on profiles; these rows carry no content.
drop policy if exists "user_interests_select" on public.user_interests;
create policy user_interests_select on public.user_interests
  for select to authenticated
  using (true);

drop policy if exists "user_interests_insert_own" on public.user_interests;
create policy user_interests_insert_own on public.user_interests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_interests_delete_own" on public.user_interests;
create policy user_interests_delete_own on public.user_interests
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.user_interests to authenticated;

-- INT-03: max 10 selections, enforced in the database. The picker sends
-- delete-then-insert (replace), so each row insert is checked against the
-- live count. The 3-minimum is the onboarding flow's skippable rule and
-- lives in the UI.
create or replace function public.enforce_interest_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.user_interests where user_id = new.user_id;
  if v_count >= 10 then
    raise exception 'You can pick at most 10 interests.';
  end if;
  return new;
end;
$$;

drop trigger if exists user_interests_limit on public.user_interests;
create trigger user_interests_limit
  before insert on public.user_interests
  for each row execute function public.enforce_interest_limit();

commit;
