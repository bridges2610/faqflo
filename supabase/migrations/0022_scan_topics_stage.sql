-- Let the onboarding scan advance through a 'topics' stage.
--
-- Apply via the Supabase SQL editor, after 0001-0021.
--
-- ⚠️ RE-RUNNABLE: the constraint is dropped `if exists` and recreated, so a
-- second run leaves the same constraint in place.
--
-- ⚠️ THIS IS A HARD PREREQUISITE, NOT A TIDY-UP. lib/scan/run.ts now writes
-- stage = 'topics' between 'questions' and 'tracking'. Without this migration
-- the check constraint below rejects that UPDATE, the tick route's write fails,
-- and every scan stalls after discovery with no citation checks ever run — the
-- most valuable stage, lost to a value the column refuses.
--
-- Deploy this BEFORE the code that writes the new value.


/* ------------------------------------------------------ scan_jobs.stage --- */

-- 0010 created this as a four-value list. The column stays `text` — the list is
-- a constraint rather than an enum precisely so that adding a stage is a
-- constraint swap and not a type migration with a rewrite behind it.
alter table public.scan_jobs
  drop constraint if exists scan_jobs_stage_valid;

alter table public.scan_jobs
  add constraint scan_jobs_stage_valid
  check (stage in ('audit', 'questions', 'topics', 'tracking', 'done'));

comment on column public.scan_jobs.stage is
  'Which stage is next: audit → questions → topics → tracking → done. NEXT_STAGE in lib/scan/run.ts is the authority on the order; this constraint only refuses values that are not stages at all.';

-- ⚠️ NOTHING IS BACKFILLED, AND NOTHING SHOULD BE. A job already sitting at
-- 'tracking' when this lands has skipped the topics stage, which costs that one
-- account a content plan it can still build from the Content screen with the
-- button that was always there. Rewinding a live job's stage to 'topics' would
-- instead re-run a paid Opus call for an account whose scan had already moved
-- past it.
