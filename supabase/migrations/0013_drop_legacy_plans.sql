-- Remove Get Cited and Stay Cited from the schema.
--
-- ⚠️ DO NOT RUN THIS AT THE SAME TIME AS 0012. Run 0012, deploy the build that
-- reads `plan`, verify it, and only then run this. Migrations here are applied
-- by hand, so the running build is whatever was deployed last — and dropping a
-- column that build still SELECTs takes the dashboard down for every customer,
-- not just the ones on the old plans.
--
-- The verify query at the bottom of the 0012 hand-off is what "verified" means.
-- If you are unsure whether the deploy has landed, this can wait indefinitely:
-- the columns below are inert once nothing reads them, and leaving them costs
-- nothing but tidiness.
--
-- Apply via the Supabase SQL editor, after 0012 AND after the deploy.


/* ---------------------------------------------------- the old milestones --- */

/*
  scan_jobs pointed at the milestone that spawned it, so the reference goes
  before the table can.

  Weekly checks need no equivalent: a milestone row existed to record that a
  specific promised check on a specific promised day had or hadn't happened,
  and a subscription promises a cadence rather than a list of dates. What ran
  is in citation_checks.checked_at, which is where the chart reads it from
  anyway.
*/
alter table public.scan_jobs
  drop column if exists milestone_id;

drop function if exists public.claim_due_milestones(integer);

drop table if exists public.tracking_milestones;


/* --------------------------------------------------------- Stay Cited --- */

/*
  Replaced by profiles.plan / plan_since, backfilled in 0012.

  Dropping the column drops profiles_subscription_valid with it — a CHECK
  constraint cannot outlive its column — so there is no separate drop for it.
*/
alter table public.profiles
  drop column if exists subscription;

alter table public.profiles
  drop column if exists subscription_since;


/* ----------------------------------------------------------- Get Cited --- */

/*
  ⚠️ THIS IS THE DESTRUCTIVE ONE, AND IT IS WORTH BEING SURE.

  get_cited_at is the only record that a site was ever bought outright. Nothing
  else in the schema carries it: audit_runs, faqs, questions and citation_checks
  all record work that was DONE, not what was paid for. Once these are gone
  there is no way to answer "did this account ever pay us $129" from the
  database — only from Stripe.

  Stripe keeps that record permanently and is the system of record for money, so
  this is the right call rather than a lossy one. But if you want it in reach
  from SQL, take a copy before running this:

    create table public.legacy_get_cited as
      select id, user_id, get_cited_at, get_cited_expires_at
        from public.sites
       where get_cited_at is not null;
*/
alter table public.sites
  drop column if exists get_cited_at;

alter table public.sites
  drop column if exists get_cited_expires_at;
