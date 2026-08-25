-- Close a public table, and pin the role on three policies.
--
-- Supabase flagged `rls_disabled_in_public` as critical: a table in the public
-- schema had Row-Level Security off, which means anyone holding the project URL
-- and the anon key could read, edit and delete every row in it. The anon key
-- ships in the browser bundle, so "anyone" is the correct reading.
--
-- ⚠️ SAFE TO RE-RUN, AND SAFE TO RUN IF THE TABLE WAS NEVER CREATED. The
-- lock-down is guarded on the table existing and the policies are dropped
-- before they are recreated, so this is a no-op the second time and on a
-- database that never had the legacy table at all.
--
-- ⚠️ THIS CHANGES NO BEHAVIOUR. Nothing in the app reads legacy_get_cited, and
-- the three policies below keep exactly the rows they kept before — the only
-- change is naming the role they apply to. If any dashboard screen goes empty
-- after this, something is wrong: see the verify query in the hand-off.
--
-- Apply via the Supabase SQL editor.


/* --------------------------------------------------- the legacy backup --- */

/*
  0013 suggested taking a copy of `sites.get_cited_at` before dropping it, and
  printed the CREATE TABLE inside a comment for whoever ran it to paste. That
  snippet carried no RLS, no policies and no revoke — so if it was pasted, the
  table inherited Supabase's default `grant all on public tables to anon,
  authenticated` and has been world-readable and world-writable ever since. It
  holds a user_id and a purchase date for every account that ever paid.

  ⚠️ LOCKED DOWN RATHER THAN DROPPED, DELIBERATELY. Dropping it would close the
  hole too, and 0013 argues Stripe is the system of record for money anyway —
  but this is reversible and a drop is not, and nothing reads this table, so
  there is no cost to keeping it while that call gets made properly.

  The shape is stripe_events' from 0003, and its reasoning applies unchanged:
  RLS on with ZERO policies denies every role that is subject to it, and the
  service role bypasses RLS entirely. Nothing here belongs to a customer, so
  there is nobody to grant it to.

  The guard is `to_regclass`, not `if exists`, because ALTER TABLE ... ENABLE
  ROW LEVEL SECURITY has no IF EXISTS form.
*/
do $$
begin
  if to_regclass('public.legacy_get_cited') is not null then
    execute 'alter table public.legacy_get_cited enable row level security';
    execute 'revoke all on public.legacy_get_cited from anon, authenticated';
  end if;
end $$;


/* ------------------------------------------------------ role on policies --- */

/*
  Three SELECT policies were written without a TO clause.

  Postgres defaults those to `TO public`, which includes `anon`. They are not
  exploitable today only because 0005 and 0006 also `revoke all ... from anon`
  on the same tables — so the safety is coming from the grant, and the policy is
  contributing nothing to it. One accidental `grant select ... to anon` later
  and the policy would happily let an unauthenticated request through, because
  `auth.uid() = user_id` is false for anon rather than an error.

  Naming the role removes that dependency: the policy stops applying to anon
  whatever the grants say. 0001 and 0009 already write every policy this way.

  ⚠️ STILL SELECT ONLY, AND THAT IS NOT NEGOTIABLE. No insert, update or delete
  policy is added here and none should ever be. 0006 states why at length: this
  table is the product's evidence, and a browser that can write its own citation
  history can report that ChatGPT cited it every day this month — into an audit
  score we then put our name to. Same for audit_runs in 0005.

  ⚠️ DROPPED FIRST BECAUSE POSTGRES HAS NO `create policy if not exists`. That
  is the same reason 0009 guards all sixteen of its policies, and the same
  reason `supabase db push` cannot be used against this project.

  There were four of these. The fourth was on tracking_milestones, which 0013
  dropped along with the table.
*/

drop policy if exists "audit_runs_select_own" on public.audit_runs;
create policy "audit_runs_select_own"
  on public.audit_runs for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "tracked_prompts_select_own" on public.tracked_prompts;
create policy "tracked_prompts_select_own"
  on public.tracked_prompts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "citation_checks_select_own" on public.citation_checks;
create policy "citation_checks_select_own"
  on public.citation_checks for select
  to authenticated
  using (auth.uid() = user_id);
