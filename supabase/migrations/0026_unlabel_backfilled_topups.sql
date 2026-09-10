-- Un-label the top-ups that 0025's backfill mistook for audits.
--
-- Apply via the Supabase SQL editor, after 0001-0025.
--
-- ⚠️ RE-RUNNABLE: the predicate only touches rows that still carry a run_id, so
-- a second execution matches nothing.


/* ---------------------------------------------- correcting 0025's guess --- */

/*
  ⚠️ WHAT WENT WRONG, SO THE NEXT PERSON DOES NOT "FIX" IT BACK.

  0025 added citation_checks.run_id and backfilled history with "one synthetic
  run per site per UTC day". That was the honest reading available at the time:
  nothing had ever recorded which checks came from a sweep, and grouping by day
  reproduced exactly what the chart already plotted.

  It cannot tell a sweep from a top-up, and the difference matters now. The
  trend draws ONE POINT PER RUN, so a customer who added a single question gets
  a second point — and a line chart claiming a week-over-week comparison that
  never happened. Observed in production: a 1-question, 3-check "run" at
  00:36Z sitting beside a 16-question, 48-check onboarding scan, on the same
  site, because 00:36Z fell on the next UTC day.

  ⚠️ AND IT ONLY MISBEHAVED BY LUCK. That row happened to share a LOCAL day with
  the scan, so the two collapsed into one bucket and nobody saw a wrong chart.
  Add the question at breakfast instead of at midnight and the fault is visible.

  The write path has been correct since 0025 shipped: the tracking route stores
  null for any ask narrower than the whole watch list. Only history is wrong,
  so only history is corrected here.
*/

/*
  ⚠️ EXACTLY ONE QUESTION, NOT A SHARE OF THE WATCH LIST.

  A percentage threshold would be a magic number that reclassifies real runs. A
  free account's entire sweep is three or four questions, and one real site here
  has a legitimate run covering three of its five. One distinct question, on a
  site watching more than one, is the only shape that cannot be anything but a
  top-up.

  ⚠️ SET TO NULL, NEVER DELETED. lib/dashboard/trend.ts folds a null-run check
  into the run it follows, so these answers keep counting toward the point they
  belong to. Deleting them would throw away measurements we paid an engine for.
*/
with sized as (
  select c.run_id,
         c.site_id,
         count(distinct c.question) as questions
  from public.citation_checks c
  where c.run_id is not null
  group by c.run_id, c.site_id
),
watched as (
  select site_id, count(*) as watch_size
  from public.tracked_prompts
  group by site_id
)
update public.citation_checks c
set run_id = null
from sized s
join watched w on w.site_id = s.site_id
where c.run_id = s.run_id
  and s.questions = 1
  and w.watch_size > 1;
