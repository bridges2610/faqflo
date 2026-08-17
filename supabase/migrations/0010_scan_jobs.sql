-- The first scan, run by the server instead of by a browser tab.
--
-- WHAT THIS IS FOR:
--
-- Buying Get Cited used to fill in exactly one of four sections. The audit
-- auto-ran from a useEffect on `?purchased=get_cited`, and Answers,
-- Opportunities and Results stayed empty until the customer found three more
-- buttons. A staged signup confirmed it: audit stored, everything else blank.
--
-- ⚠️ WHY THIS NEEDS A TABLE AND NOT A LOOP. The obvious fix is to chain the
-- three existing client calls the way runTracking() already chains its passes.
-- That was rejected for one reason: a full first scan is minutes of work — a
-- crawl of up to 100 pages, an Opus call, then ~45 search-backed engine calls
-- in slices of five — and a customer who closes the tab is entitled to come
-- back to a finished dashboard rather than to whatever their browser managed
-- before they clicked away. Durable work needs somewhere durable to keep its
-- place, and lib/dashboard/provider.tsx:297 has said so for a while: "THE
-- CLIENT LOOPS BECAUSE THE SERVER CANNOT... there is no queue in this project."
-- This row is the smallest thing that is one.
--
-- ⚠️ THE ORDER OF STAGES IS FORCED BY DATA, NOT BY PREFERENCE. Discovery reads
-- the pages the audit crawled (lib/dashboard/discover.ts refuses without them);
-- tracking asks the questions discovery produced. Running them concurrently
-- would mean asking the engines about a question list that does not exist yet.
--
-- Apply via the Supabase SQL editor, after 0001-0009.


/* -------------------------------------------------------------- the job --- */

create table if not exists public.scan_jobs (
  -- text, minted by the caller, for the same reason as 0009: the enqueueing
  -- code wants to know the id it just created without a read-back.
  id text primary key,
  site_id uuid not null references public.sites on delete cascade,
  user_id uuid not null references auth.users on delete cascade,

  -- Which stage is next. 'done' is a stage rather than a status so the splash
  -- can render a finished job with its progress intact instead of blanking.
  stage text not null default 'audit',
  status text not null default 'queued',

  -- Per-stage counters, for the progress bar. Shape is the runner's business;
  -- nothing queries inside it.
  --
  -- ⚠️ A stage with an unknown total stores null rather than 0. The progress
  -- component draws an indeterminate bar for null and a real one for a number,
  -- because "0 of 0" reads as finished when the truth is "we have not counted
  -- yet" — the same rule the tracking meter already follows.
  progress jsonb not null default '{}'::jsonb,

  -- Why it stopped, when it stopped badly. Shown to the customer, so it holds a
  -- sentence rather than a stack.
  error text,

  /*
    ⚠️ THE LEASE IS THE LOCK, AND IT IS THE WHOLE CONCURRENCY DESIGN.

    A slice claims the job by conditionally updating this column, so two
    runners racing produce one winner and one no-op — the database decides,
    not the application. It also doubles as crash recovery: a slice that dies
    mid-flight leaves the lease behind, and the next tick after it expires
    picks the job back up. Nothing has to notice the failure for it to heal.

    Never null while running. A null lease on a running row would be claimable
    by everyone at once.
  */
  lease_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,

  constraint scan_jobs_stage_valid check (stage in ('audit', 'questions', 'tracking', 'done')),
  constraint scan_jobs_status_valid check (status in ('queued', 'running', 'done', 'failed'))
);

/*
  ⚠️ ONE LIVE SCAN PER SITE, ENFORCED HERE RATHER THAN IN THE ENQUEUEING CODE.

  Stripe fulfilment runs twice by design — once from the return page, once from
  the webhook (lib/stripe/fulfil.ts:9) — and both call the same enqueue. Without
  this index that is two jobs, two crawls and two sets of engine calls for one
  payment. With it, the second insert is a duplicate the caller can ignore.

  Partial, so a finished job does not block the next one: a customer may scan
  again later, and only 'queued' or 'running' rows are in the way.
*/
create unique index if not exists scan_jobs_one_live_per_site
  on public.scan_jobs (site_id)
  where status in ('queued', 'running');

-- How the runner finds work: oldest claimable job first.
create index if not exists scan_jobs_claimable_idx
  on public.scan_jobs (status, lease_until);


/* ------------------------------------------------------------ the claim --- */

/*
  Take the oldest claimable job, atomically.

  ⚠️ A FUNCTION RATHER THAN AN UPDATE FROM THE CLIENT, FOR TWO REASONS.

  PostgREST does not reliably support LIMIT on an UPDATE, so "claim exactly one
  job" cannot be expressed through the REST interface without either updating
  every claimable row or relying on behaviour that varies by version. Neither is
  something to discover in production.

  More importantly, FOR UPDATE SKIP LOCKED is the right tool and is only
  available here. Two runners arriving together take two DIFFERENT jobs instead
  of one blocking on the other — with a plain conditional update the loser gets
  nothing and goes home, which wastes an invocation every time the chain and a
  poll overlap. That happens constantly: the splash page pokes the runner on
  every poll while the runner is already chaining itself.

  SECURITY DEFINER so the service role's call runs with the owner's rights, and
  a fixed search_path so the body cannot be redirected by a caller's setting.
*/
create or replace function public.claim_scan_job(lease_seconds integer default 120)
returns public.scan_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.scan_jobs;
begin
  select * into claimed
  from public.scan_jobs
  where stage <> 'done'
    and (
      status = 'queued'
      or (status = 'running' and (lease_until is null or lease_until < now()))
    )
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.scan_jobs
  set status = 'running',
      lease_until = now() + make_interval(secs => lease_seconds),
      updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

-- ⚠️ Service role only. This hands out work that spends money — a crawl, an
-- Opus call, and up to fifteen search-backed engine calls — so `authenticated`
-- must not be able to call it. REVOKE from public first: EXECUTE is granted to
-- PUBLIC by default on new functions, which would otherwise leave this open.
revoke all on function public.claim_scan_job(integer) from public;
revoke all on function public.claim_scan_job(integer) from anon, authenticated;


/* ------------------------------------------------------------------ RLS --- */

alter table public.scan_jobs enable row level security;

-- ⚠️ SELECT ONLY, unlike the customer content in 0009. A scan job spends money
-- — a crawl, an Opus call, and ~45 search-backed engine calls — so a browser
-- that could insert one could bill us on demand, and a browser that could
-- update one could rewind `stage` and make the whole thing run again. Rows are
-- written by the service role from app/api/scan/tick/route.ts and
-- lib/stripe/fulfil.ts. Same reasoning as citation_checks in 0006.
--
-- The customer still needs to watch their own scan, hence the read.
drop policy if exists "Scan jobs are readable by their owner" on public.scan_jobs;
create policy "Scan jobs are readable by their owner"
  on public.scan_jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);
