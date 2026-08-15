-- Citation tracking: what the answer engines actually said, and when.
--
-- The feature Stay Cited is sold on, and until now the one thing in this
-- product that had never existed. The dashboard for it has been built and
-- waiting since the beginning — components/dashboard/tracking-workspace.tsx
-- renders a full report and lib/dashboard/audit-context.ts already knows how to
-- turn checks into scored audit findings — but nothing produced a single row,
-- and every surface said so in plain words rather than showing a zero.
--
-- TWO TABLES, AND THEY ARE DIFFERENT KINDS OF THING:
--
--   tracked_prompts   the INPUT. Which questions we watch for a site.
--   citation_checks   the OUTPUT log. One row per question × engine × run.
--
-- The input list has to be persisted rather than derived from the checks,
-- because a question that has never been asked appears in no check — deriving
-- one from the other means a newly tracked question can never get its first
-- run. It also has to live in Postgres rather than localStorage: the scheduler
-- this is heading towards runs with no browser attached.
--
-- Apply via the Supabase SQL editor, after 0001–0005.


/* ------------------------------------------------------- tracked prompts --- */

create table if not exists public.tracked_prompts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,

  -- Denormalised from sites.user_id so the RLS policy below is a column
  -- comparison rather than a subquery on every read. Same reasoning as 0005.
  user_id uuid not null references auth.users (id) on delete cascade,

  -- ⚠️ MUST MATCH DiscoveredQuestion.question BYTE FOR BYTE.
  --
  -- components/dashboard/tracking-workspace.tsx finds the discovered question
  -- behind a citation check by exact string equality, and uses it to mark the
  -- question covered once an answer is drafted. That is the loop closing: you
  -- see you were not cited, you write the answer, the question stops being
  -- open. A trimmed or re-cased copy here breaks it silently — the button still
  -- works, it just never marks anything.
  question text not null,

  created_at timestamptz not null default now(),

  -- Makes the upsert on re-tracking a no-op instead of a duplicate, and stops
  -- the same question being watched twice against one site's prompt cap.
  unique (site_id, question)
);

create index if not exists tracked_prompts_site_idx
  on public.tracked_prompts (site_id);


/* -------------------------------------------------------- citation checks --- */

create table if not exists public.citation_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- The question as asked. Denormalised from tracked_prompts on purpose: this
  -- is a log of what happened, and it must stay true even if the prompt is
  -- later retired or reworded. A join would rewrite history.
  question text not null,

  -- ⚠️ Must stay in step with ENGINES in lib/dashboard/types.ts. The chart
  -- keys its colours off these exact strings, so an engine here that the UI
  -- does not know renders an uncoloured line.
  engine text not null check (engine in ('ChatGPT', 'Perplexity', 'Gemini')),

  -- cited     the site's own domain was among the answer's sources
  -- mentioned the business was named in the text, but not linked
  -- absent    neither
  outcome text not null check (outcome in ('cited', 'mentioned', 'absent')),

  -- Who got cited when we did not. Drives the "Not cited for" worklist, which
  -- is the thing that turns a bad result into the next answer to write.
  cited_instead text,

  -- ⚠️ THE EVIDENCE, AND THE REASON THIS TABLE IS NOT JUST COUNTS.
  --
  -- Nothing else in this codebase stores a raw model response — the question
  -- and content-plan routes keep only the parsed result. This is the deliberate
  -- exception. "Why does it say I wasn't cited?" is a question a customer will
  -- ask, and the only honest answer is the source list that run actually
  -- returned. Recomputing it later asks a different engine on a different day
  -- and may disagree with the row it is supposed to explain.
  sources jsonb not null default '[]'::jsonb,

  -- Enough of the answer to see the mention in context. Not the whole thing:
  -- this table gets one row per prompt per engine per run, and full answers
  -- would make it the largest thing in the database by an order of magnitude.
  answer_excerpt text,

  checked_at timestamptz not null default now()
);

-- The two queries this table serves: one site's checks newest-first (the
-- report), and the daily rollup that feeds the chart. Both lead with site_id.
create index if not exists citation_checks_site_checked_idx
  on public.citation_checks (site_id, checked_at desc);


/* --------------------------------------------------------------- access --- */

alter table public.tracked_prompts enable row level security;
alter table public.citation_checks enable row level security;

create policy "tracked_prompts_select_own"
  on public.tracked_prompts for select
  using (auth.uid() = user_id);

create policy "citation_checks_select_own"
  on public.citation_checks for select
  using (auth.uid() = user_id);

-- ⚠️ SELECT ONLY, ON BOTH. No insert, update or delete policy exists for
-- `authenticated`, and none should.
--
-- Same reasoning as audit_runs in 0005 and sites.get_cited_at in 0001, and it
-- bites harder here: this table IS the product's evidence. A browser that can
-- write its own citation history can report that ChatGPT cited it every day
-- this month — to itself, which is merely sad, but also into the audit score,
-- which is a number we then put our name to. Rows are written by the service
-- role from app/api/dashboard/tracking/route.ts, after the session, the site
-- ownership and the subscription have all been checked server-side.
revoke all on public.tracked_prompts from anon, authenticated;
revoke all on public.citation_checks from anon, authenticated;

grant select on public.tracked_prompts to authenticated;
grant select on public.citation_checks to authenticated;
