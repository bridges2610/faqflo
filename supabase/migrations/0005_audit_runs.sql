-- Audit history: one row per completed run, so a score becomes a trajectory.
--
-- Until now the app kept exactly one report per site — `audits` in localStorage
-- is a Record keyed by site id, and each run overwrote the last. So the only
-- thing a customer could ever be told was "you scored 62", with no way to say
-- whether that was better or worse than last month, and no way to show that the
-- fixes they made actually moved anything. Clearing browser data or opening the
-- dashboard on a phone lost even that.
--
-- This is deliberately NOT a move of the whole report into Postgres. The report
-- is a large blob only its own account reads, and localStorage stays the cache
-- for it. What lands here is the small, comparable part: the number, when it was
-- taken, how deep the run was, and the per-pillar breakdown that explains a
-- change. That is enough for a trend and cheap enough to write on every run.
--
-- Apply via the Supabase SQL editor, after 0001–0004.

create table if not exists public.audit_runs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,

  -- Denormalised from sites.user_id so the RLS policy below is a column
  -- comparison rather than a subquery on every read.
  user_id uuid not null references auth.users (id) on delete cascade,

  score int not null,

  -- How many findings the score is actually based on. Without it a 62 from a
  -- three-check quick run looks like a 62 from a forty-check full one.
  scored_count int not null,

  -- ⚠️ THE REASON ANY TREND HAS TO SEGMENT.
  --
  -- A quick run scores 3 findings across 2 pillars; a full run scores ~40
  -- across 6. They are not the same measurement and plotting them on one line
  -- shows a cliff that is not a change to the customer's site.
  depth text not null check (depth in ('quick', 'full')),

  -- Per-pillar scores, as { "technical": 78, "structure": 40, … }.
  --
  -- Stored because the overall number alone cannot explain its own movement.
  -- The clearest case: a customer who starts Stay Cited gains the AI-visibility
  -- pillar, which was previously `locked` and excluded from the weighting — so
  -- their score moves without their site changing. Without the breakdown that
  -- is an unexplainable drop in a chart.
  pillar_scores jsonb not null default '{}'::jsonb,

  checked_at timestamptz not null default now()
);

-- The only query this table serves: one site's runs, newest first.
create index if not exists audit_runs_site_checked_idx
  on public.audit_runs (site_id, checked_at desc);

alter table public.audit_runs enable row level security;

create policy "audit_runs_select_own"
  on public.audit_runs for select
  using (auth.uid() = user_id);

-- ⚠️ SELECT ONLY. No insert, update or delete policy exists for
-- `authenticated`, and none should.
--
-- Same reasoning as `sites.get_cited_at` in 0001: a client that can write its
-- own history can write a history that never happened. Rows are inserted by the
-- service role from app/api/audit/route.ts, where the report was just produced
-- server-side and the session has already been checked.
revoke all on public.audit_runs from anon, authenticated;
grant select on public.audit_runs to authenticated;
