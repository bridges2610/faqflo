-- Get Cited becomes 90 days on a schedule, instead of 30 days of button-pressing.
--
-- WHAT THIS IS FOR:
--
-- Tracking used to run only when somebody pressed Run on the Results page.
-- Thirty days of that is too short to draw a trend and invisible unless the
-- customer keeps clicking. Get Cited now buys a 90-day window with four checks
-- on fixed days — 7, 30, 60 and 90 — fired by a daily cron, on top of the day-0
-- check the purchase scan already runs. Five points, no clicking, and a spend
-- that is known to the exact engine call before anyone pays.
--
-- ⚠️ TWO THINGS HERE, AND THE ORDER BETWEEN THEM MATTERS.
--
--   1. sites.get_cited_expires_at   — the deadline, now STORED.
--   2. tracking_milestones          — which checks are due, and which have run.
--
-- The backfill in part 1 compares against the OLD thirty-day rule, so it has to
-- run while that rule is still the one in force — i.e. BEFORE the deploy that
-- sets GET_CITED_WINDOW_DAYS to 90. Applying it afterwards would read a
-- ninety-day world and grandfather nobody.
--
-- Apply via the Supabase SQL editor, after 0001-0010.


/* --------------------------------------------------------- stored expiry --- */

/*
  ⚠️ WHY THE DEADLINE STOPS BEING COMPUTED.

  lib/dashboard/plans.ts has carried this warning since the window was written:
  "Deadlines are COMPUTED from getCitedAt, not stored. Changing this number
  therefore moves the deadline for every existing customer, retroactively."
  Raising 30 to 90 is exactly that change, and it does not only re-open
  tracking — getCitedActive feeds canGenerate, which feeds full audits, question
  discovery, content plans and answer generation. Every one of those spends
  money on an LLM or on crawling somebody else's server.

  So the deadline moves into a column, each site keeps the date its customer was
  actually told, and the constant becomes a fallback for rows written before
  this migration lands.
*/
alter table public.sites
  add column if not exists get_cited_expires_at timestamptz;

comment on column public.sites.get_cited_expires_at is
  'When Get Cited stops granting new work for this site. Null falls back to get_cited_at + GET_CITED_WINDOW_DAYS.';

/*
  Still live under the old rule → extended to the new window.

  92 rather than 90 is a deliberate two-day grace. Milestones are due at UTC
  midnight and the cron fires once a day within an hour of its slot, so a day-90
  check on a site bought at 14:00 would otherwise land on the wrong side of its
  own deadline and be refused by the period check. The customer-facing number
  stays 90; the grace only stops the last check racing the door.
*/
update public.sites
   set get_cited_expires_at = get_cited_at + interval '92 days'
 where get_cited_at is not null
   and get_cited_expires_at is null
   and get_cited_at + interval '30 days' > now();

/*
  Already closed → stays closed, at the date the customer was actually given.

  ⚠️ THIS IS THE HALF THAT PROTECTS THE BUSINESS AND THE CUSTOMER AT ONCE.
  Without it, raising the constant would silently reopen full audits and Opus
  generation for everyone who bought in the last ninety days and has already
  been told their window ended — including anyone who upgraded to Stay Cited
  BECAUSE it ended, who would now be paying for something they were just given
  back. To extend those sites instead, change this interval to 92 days.
*/
update public.sites
   set get_cited_expires_at = get_cited_at + interval '30 days'
 where get_cited_at is not null
   and get_cited_expires_at is null
   and get_cited_at + interval '30 days' <= now();


/* ------------------------------------------------------------ milestones --- */

/*
  One row per scheduled check.

  ⚠️ WHY A TABLE AND NOT AN INFERENCE FROM citation_checks. The obvious cheap
  version is "did any check land in the day-30 bucket?", and it cannot answer
  the questions this needs to answer. It has no way to say SKIPPED, which is
  what every milestone an existing customer has already passed must be — the one
  thing this must never do is discover four overdue checks and fire them all at
  once. It also cannot tell a check that ran and found nothing from one that
  never ran, and the day-0 purchase scan and a subscriber's manual runs write
  into the same table it would be reading.

  ⚠️ WHY NOT A jsonb COLUMN ON sites. No unique constraint, so two cron
  invocations race a read-modify-write and one silently wins — the exact
  double-spend the lease in 0010 exists to prevent. And sites is the entitlement
  row: a lost update there could clobber get_cited_at itself.
*/
create table if not exists public.tracking_milestones (
  id uuid primary key default gen_random_uuid(),

  site_id uuid not null references public.sites on delete cascade,
  -- Denormalised for RLS, exactly as tracked_prompts does it in 0006: the
  -- owner policy must not need a join to sites on every read.
  user_id uuid not null references auth.users on delete cascade,

  -- Days after get_cited_at. Constrained rather than free, because a typo here
  -- is a check that fires on a day nobody was promised.
  day smallint not null,

  /*
    ⚠️ FLOORED TO UTC MIDNIGHT by the writer, not stored as the purchase time
    plus N days. Due-ness is compared against now() by a cron that runs once a
    day, so an anchor at 14:07 would make "day 7" mean "day 7 in the afternoon,
    if the sweep happens to be later than that" — which is a different day for
    different customers.
  */
  due_at timestamptz not null,

  status text not null default 'pending',

  -- The scan job that ran it, for tracing a check back to its slices.
  job_id text references public.scan_jobs on delete set null,

  -- What it actually cost, recorded per milestone rather than per window so a
  -- half-failed check that retried cannot quietly starve the next one.
  checks_written integer,

  started_at timestamptz,
  finished_at timestamptz,

  -- Why it stopped, when it stopped badly. Shown to the customer, so a sentence
  -- rather than a stack — the same rule scan_jobs.error follows.
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tracking_milestones_day_valid
    check (day in (7, 30, 60, 90)),

  constraint tracking_milestones_status_valid
    check (status in ('pending', 'running', 'done', 'skipped', 'failed')),

  /*
    ⚠️ THE IDEMPOTENCE, AND THE WHOLE REASON THIS TABLE IS SAFE.

    A cron that fires twice, a redelivered Stripe event and the backfill sweep
    all insert the same four rows for a site. With `on conflict do nothing` on
    this constraint, the second one is a no-op instead of a second $0.45 of
    engine calls.
  */
  constraint tracking_milestones_unique_per_site unique (site_id, day)
);

/*
  How the cron finds work.

  PARTIAL, on purpose: the index then holds only the outstanding schedule rather
  than every milestone ever run, so it stays roughly constant in size while the
  table grows by four rows per customer forever.
*/
create index if not exists tracking_milestones_due_idx
  on public.tracking_milestones (due_at)
  where status = 'pending';

-- Reading one site's schedule for the Results page timeline.
create index if not exists tracking_milestones_site_idx
  on public.tracking_milestones (site_id, day);

-- Which job belongs to which milestone, for the tick route's write-back.
alter table public.scan_jobs
  add column if not exists milestone_id uuid
    references public.tracking_milestones on delete set null;


/* ------------------------------------------------------------ the claim --- */

/*
  Take the due milestones, atomically.

  Modelled on claim_scan_job() in 0010 and for the same two reasons: PostgREST
  cannot reliably express LIMIT on an UPDATE, and FOR UPDATE SKIP LOCKED is only
  available in a function. Two sweeps overlapping take different rows rather
  than one blocking on the other.

  SECURITY DEFINER with a fixed search_path, again as 0010 — the body must not be
  redirectable by a caller's setting.
*/
create or replace function public.claim_due_milestones(limit_count integer default 25)
returns setof public.tracking_milestones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.tracking_milestones;
begin
  for claimed in
    select *
    from public.tracking_milestones
    where status = 'pending'
      and due_at <= now()
    order by due_at
    for update skip locked
    limit limit_count
  loop
    update public.tracking_milestones
    set status = 'running',
        started_at = now(),
        updated_at = now()
    where id = claimed.id
    returning * into claimed;

    return next claimed;
  end loop;

  return;
end;
$$;

-- ⚠️ Service role only, for the same reason as claim_scan_job: this hands out
-- work that spends money — 15 questions against three search-backed engines per
-- milestone. REVOKE from public first, because EXECUTE is granted to PUBLIC by
-- default on new functions.
revoke all on function public.claim_due_milestones(integer) from public;
revoke all on function public.claim_due_milestones(integer) from anon, authenticated;


/* ------------------------------------------------------------------ RLS --- */

alter table public.tracking_milestones enable row level security;

/*
  Read-only to the browser, like citation_checks in 0006 and scan_jobs in 0010.

  The Results page renders this schedule, so the owner must be able to see it.
  Nobody but the service role may write it: a client that could insert its own
  milestone rows could schedule itself unlimited engine calls, which is the
  budget bypassed in one INSERT.
*/
create policy "Owners read their milestones"
  on public.tracking_milestones for select
  using (auth.uid() = user_id);

grant select on public.tracking_milestones to authenticated;
