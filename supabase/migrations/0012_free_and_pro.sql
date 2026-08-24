-- Two products become two plans: Free and Pro.
--
-- WHAT THIS IS FOR:
--
-- Get Cited ($129 once, per SITE, 90-day window) and Stay Cited ($29/month, per
-- ACCOUNT) are retired. What replaces them is one axis: an account is 'free' or
-- 'pro'. Pro is $39/month or $390/year.
--
-- The old shape needed three axes at once — site scope, account scope, and a
-- time window — which is why lib/dashboard/plans.ts grew to 568 lines and why
-- "did they ever pay" and "has it expired" were separate questions everywhere.
-- One account-level column answers both.
--
-- ⚠️ THIS MIGRATION ONLY ADDS. The drops live in 0013 and are deliberately not
-- here. Migrations in this project are pasted by hand into the Supabase SQL
-- editor, so a deploy can land before the SQL does — and dropping a column the
-- currently-running build still SELECTs takes the dashboard down for everyone.
-- Add here, deploy, verify, then drop.
--
-- Apply via the Supabase SQL editor, after 0001-0011.


/* ------------------------------------------------------------- the plan --- */

/*
  Which plan the ACCOUNT is on. The only entitlement axis there is now.

  Default 'free' rather than nullable: every profile has a plan, and a null
  would make every read in lib/auth/entitlements.ts have to decide what null
  means. It means free, so say so once, here.
*/
alter table public.profiles
  add column if not exists plan text not null default 'free';

comment on column public.profiles.plan is
  'free | pro. The account''s plan. Written only by the Stripe webhook via the service role.';

alter table public.profiles
  drop constraint if exists profiles_plan_valid;

alter table public.profiles
  add constraint profiles_plan_valid check (plan in ('free', 'pro'));

/*
  When the current Pro run started — the billing anniversary.

  ⚠️ LOAD-BEARING, NOT DECORATION. trackingPeriod() walks whole calendar months
  forward from this date to find the window a check budget is counted over. A
  rolling 30-day window would let checks age out of the budget one at a time,
  so a customer at the ceiling would be let through in dribs rather than told a
  date. Cleared when the subscription lapses.
*/
alter table public.profiles
  add column if not exists plan_since timestamptz;

comment on column public.profiles.plan_since is
  'When the current Pro subscription started. Null on free. Anchors the monthly check budget.';

/*
  ⚠️ NO GRANT, DELIBERATELY — AND THIS IS THE WHOLE SECURITY PROPERTY.

  0001 revoked everything on profiles from `authenticated` and granted back
  exactly `update (name)`; 0002 added `insert (id, email, name)` for the
  self-heal path. `plan` and `plan_since` stay outside both lists, exactly as
  `subscription` did, so a browser cannot promote itself to Pro. That is the
  reason lib/supabase/admin.ts (service role) exists at all.

  If you are adding a column to profiles later: the default for a new column is
  NO grant, so doing nothing is the safe outcome. Check anyway.
*/

-- Carry the old subscribers over. Get Cited is not carried: it was a one-time
-- purchase of a finished deliverable, not a plan, and everything it produced
-- stays in the customer's own faqs/questions/audit_runs rows either way.
update public.profiles
   set plan = 'pro',
       plan_since = coalesce(subscription_since, created_at)
 where subscription = 'stay_cited'
   and plan = 'free';


/* -------------------------------------------------------- weekly checks --- */

/*
  When this site's next automatic citation check is due. Null = never.

  ⚠️ THIS REPLACES tracking_milestones, AND THE SHAPE CHANGE IS THE POINT.

  0011 modelled a FINITE schedule — four rows per site, on days 7/30/60/90 —
  because Get Cited bought a fixed number of checks inside a fixed window. Its
  own comment argued against a column on `sites` for two reasons, and neither
  survives the move to a subscription:

    "No unique constraint, so two cron invocations race a read-modify-write."
    A single UPDATE inside claim_due_checks() below is not a read-modify-write;
    FOR UPDATE SKIP LOCKED makes two overlapping sweeps take different rows.

    "sites is the entitlement row: a lost update could clobber get_cited_at."
    sites is no longer the entitlement row. The entitlement is profiles.plan.

  What a weekly cadence actually needs is a cursor, not a schedule: one row
  per site that moves forward a week each time it fires. A milestone table
  would grow by one row per site per week, forever, to store the same fact.
*/
alter table public.sites
  add column if not exists next_check_at timestamptz;

comment on column public.sites.next_check_at is
  'When the weekly automatic check is next due. Null on free accounts and on downgrade. Service-role only.';

/*
  How the cron finds work.

  PARTIAL, like tracking_milestones_due_idx before it: the index holds only
  scheduled sites rather than every site ever created, so it stays small while
  the free tier grows.
*/
create index if not exists sites_next_check_idx
  on public.sites (next_check_at)
  where next_check_at is not null;

-- Existing subscribers start their weekly cadence immediately rather than
-- waiting for their next upgrade event, which will never come.
update public.sites s
   set next_check_at = now()
  from public.profiles p
 where p.id = s.user_id
   and p.plan = 'pro'
   and s.next_check_at is null;

/*
  ⚠️ NO GRANT for next_check_at either, and for a sharper reason than `plan`.

  0001 grants `update (name, domain, industry, location, profile_source)` on
  sites and 0008 adds `(country)`. A browser that could write next_check_at
  could set it to now() in a loop and bill us for three search-backed engines
  on every sweep. It is a spending cursor, so it belongs to the service role.
*/


/* ------------------------------------------------------------ the claim --- */

/*
  Take the sites whose weekly check is due, atomically, and move each one on.

  Modelled on claim_due_milestones() in 0011 and claim_scan_job() in 0010, for
  the same two reasons: PostgREST cannot reliably express LIMIT on an UPDATE,
  and FOR UPDATE SKIP LOCKED is only available inside a function. Two sweeps
  overlapping take different rows rather than one blocking on the other.

  SECURITY DEFINER with a fixed search_path, again as 0010 and 0011 — the body
  must not be redirectable by a caller's setting.
*/
create or replace function public.claim_due_checks(limit_count integer default 25)
returns setof public.sites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.sites;
begin
  for claimed in
    select s.*
    from public.sites s
    /*
      ⚠️ THE JOIN IS NOT REDUNDANT WITH next_check_at BEING NULL ON FREE.

      The cursor is set on upgrade and cleared on downgrade, so in the normal
      case the two agree. They can disagree for as long as it takes a
      cancellation webhook to land, or if a clear ever fails — and the failure
      mode is spending money on an account that has stopped paying. The plan
      column is the entitlement; the cursor is only a date. Ask the entitlement.
    */
    join public.profiles p on p.id = s.user_id
    where s.next_check_at is not null
      and s.next_check_at <= now()
      and p.plan = 'pro'
    order by s.next_check_at
    for update of s skip locked
    limit limit_count
  loop
    update public.sites
    /*
      ⚠️ FROM THE DUE DATE, NOT FROM now() — AND CLAMPED FORWARD.

      Adding a week to the due date keeps a stable weekday: a customer whose
      check lands on Tuesday keeps landing on Tuesday, rather than drifting
      later every week by however long the sweep happened to be delayed.

      greatest(..., now()) is what stops that stability becoming a backlog. If
      the cron is down for a month, a plain +7 days would still be in the past,
      and the site would be claimed again on every sweep until it caught up —
      four weeks of engine calls fired in an afternoon for checks nobody was
      waiting on. Missed weeks are missed; the next one is a week from today.
    */
    set next_check_at = greatest(claimed.next_check_at + interval '7 days', now())
    where id = claimed.id
    returning * into claimed;

    return next claimed;
  end loop;

  return;
end;
$$;

/*
  ⚠️ Service role only, for the same reason as claim_scan_job and
  claim_due_milestones: this hands out work that spends money — 25 questions
  against three search-backed engines per claimed site.

  REVOKE from public FIRST. EXECUTE is granted to PUBLIC by default on new
  functions, so revoking only from anon/authenticated leaves it reachable.
*/
revoke all on function public.claim_due_checks(integer) from public;
revoke all on function public.claim_due_checks(integer) from anon, authenticated;
