-- Product change (post-G): the cabin interest-tag cap is raised from 3 to 10
-- so owners can pick a wider set of topics (minimum stays 1). 0008 now ships
-- the 10-cap definition already; this `create or replace` re-asserts it so
-- databases that applied the original 0008 (3-cap) are fixed by simply
-- running this migration in order. Idempotent on fresh installs.
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
