-- Accounts: profiles and sites.
--
-- Two tables, both owned by an auth user, both behind row-level security.
-- This is the stage where "which tier is this customer on" stops being a
-- client-side opinion and becomes a fact the server can check.
--
-- Column names are snake_case because that is Postgres convention; the app's
-- camelCase types are mapped at the store boundary. lib/dashboard/types.ts has
-- always said these types were "written to map onto Postgres tables" — this is
-- that mapping arriving.
--
-- Apply via the Supabase SQL editor, or `supabase db push` if you adopt the CLI.

/* ------------------------------------------------------------- profiles --- */

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  email text not null,
  -- Mirrors Subscription in lib/dashboard/types.ts: 'none' | 'stay_cited'.
  subscription text not null default 'none',
  subscription_since timestamptz,
  created_at timestamptz not null default now(),

  constraint profiles_subscription_valid check (subscription in ('none', 'stay_cited'))
);

/* ---------------------------------------------------------------- sites --- */

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  -- Bare host, no scheme, no trailing slash — normalizeDomain() in the store
  -- is what guarantees that, and it runs before every write.
  domain text not null,
  industry text,
  location text,
  profile_source text,
  -- When Get Cited was bought for this site. null = free tier for this site.
  get_cited_at timestamptz,
  created_at timestamptz not null default now(),

  constraint sites_domain_unique_per_user unique (user_id, domain),
  constraint sites_profile_source_valid
    check (profile_source is null or profile_source in ('schema', 'inferred', 'manual'))
);

create index if not exists sites_user_id_idx on public.sites (user_id);

/* ------------------------------------------------------------------ RLS --- */

-- RLS is the actual boundary. Everything the app does on top of it is
-- convenience: if a policy here is wrong, no amount of checking in a route
-- handler makes the data safe.

alter table public.profiles enable row level security;
alter table public.sites enable row level security;

create policy "Profiles are readable by their owner"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Profiles are updatable by their owner"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Sites are readable by their owner"
  on public.sites for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Sites are insertable by their owner"
  on public.sites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Sites are updatable by their owner"
  on public.sites for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Sites are deletable by their owner"
  on public.sites for delete
  to authenticated
  using ((select auth.uid()) = user_id);

/* ------------------------------------------------- entitlement columns --- */

-- RLS decides which ROWS you may touch; it cannot stop you writing a column in
-- a row you already own. Entitlements live in exactly those columns, so they
-- are locked at the GRANT level instead.
--
-- Without this, a signed-in user could POST `get_cited_at` onto their own site
-- through the public API and grant themselves the paid tier — which is the
-- thing lib/dashboard/store.ts:271 already warns about: "a browser that can
-- grant its own entitlements has no entitlements."
--
-- `subscription`, `subscription_since` and `get_cited_at` are writable only by
-- the service role, which is where the Stripe webhook will write them.

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;

revoke all on public.sites from anon, authenticated;
grant select, delete on public.sites to authenticated;
grant insert (user_id, name, domain, industry, location, profile_source) on public.sites to authenticated;
grant update (name, domain, industry, location, profile_source) on public.sites to authenticated;

/* -------------------------------------------------------- signup trigger --- */

-- One profile per auth user, created by the database rather than the client.
--
-- It has to be a trigger and not an app-side insert: a Google sign-up and an
-- email sign-up arrive through completely different code paths, and a profile
-- that only gets written on one of them is a class of bug that shows up weeks
-- later as "this account has no name". The database sees both.
--
-- `security definer` because the inserting session is not yet authenticated;
-- `set search_path = ''` per Supabase's guidance for definer functions, which
-- is why every name below is schema-qualified.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    -- Google gives us a name; email sign-up gives us whatever the form sent.
    -- Falling back to the local part beats showing a blank account menu.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
