-- 0010_profile_backfill.sql — fix "frozen on onboarding"
-- Users who signed in BEFORE migrations ran have an auth.users row but no
-- profiles row (the handle_new_user trigger only fires on new inserts).
-- Without a profile row the client shows a blank onboarding page forever:
-- currentUserProfile() is null, and completeOnboarding's UPDATE affects 0
-- rows while still reporting success (Supabase returns no error).
--
-- Fixes, idempotent and safe to re-run:
--   1. Re-assert the signup trigger (covers partially-applied 0001).
--   2. Backfill one profiles row per existing auth.users row that lacks one.
--   3. Allow authenticated users to insert their OWN profile row so the
--      client can self-heal (completeOnboarding upserts when the row is
--      missing). Owner-only: id = auth.uid().

-- 1. re-assert the trigger -------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    null,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. backfill existing users ------------------------------------------------
insert into public.profiles (id, username, display_name, avatar_url)
select
  u.id,
  null,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- 3. owner self-insert (completeOnboarding upsert) --------------------------
drop policy if exists "profiles_insert_trigger_only" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
  on profiles for insert to authenticated
  with check (id = auth.uid());
