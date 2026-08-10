-- Let an account create its own profile row.
--
-- 0001 gave `profiles` a select and an update(name) grant, and left insertion
-- entirely to the handle_new_user trigger. That is correct for every account
-- created from now on — but a trigger fires on insert, so it can do nothing
-- for accounts that already existed when it was added.
--
-- Those accounts had a valid session and no profile row, which the app read as
-- "not signed in", which sent them to /sign-in, which the proxy read as
-- "already signed in" and sent back to /dashboard. An infinite redirect. The
-- app-side fix is in lib/auth/dal.ts; this is the grant that lets the repair
-- actually write.
--
-- ⚠️ The insert is scoped to (id, email, name). `subscription` and
-- `subscription_since` are deliberately NOT granted, so a self-created row
-- takes the column default of 'none'. A user may bring their profile into
-- existence; they still cannot put themselves on a paid tier. That is the
-- property the entitlement design rests on, and it is unchanged by this file.
--
-- Apply via the Supabase SQL editor, after 0001.

create policy "Profiles are insertable by their owner"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

grant insert (id, email, name) on public.profiles to authenticated;
