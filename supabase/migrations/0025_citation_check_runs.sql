-- Which sweep produced a check, so the trend can plot runs rather than days.
--
-- Apply via the Supabase SQL editor, after 0001-0024.
--
-- ⚠️ RE-RUNNABLE: `add column if not exists` and `create index if not exists`
-- are no-ops the second time, and the backfill only touches rows where run_id is
-- still null, so running this twice cannot re-key rows that already have one.


/* ------------------------------------------------------- check provenance --- */

/*
  ⚠️ NO GRANT HERE, AND THAT IS CHECKED RATHER THAN ASSUMED.

  0006 does `revoke all on public.citation_checks from anon, authenticated`
  followed by `grant select on public.citation_checks to authenticated` — a
  TABLE-level select with no column allow-list, so a new column is readable by
  the browser the moment it exists. 0008_tracking_country.sql added a column
  under the same reasoning and says so in its own note.

  That is the opposite of public.profiles, where 0001 granted back a column
  allow-list and 0021/0023 therefore add unwritable columns on purpose. The
  distinction there is about WRITES; this column is service-role write, browser
  read, like every other column on this table. citation_checks is evidence: the
  browser has never been able to write it and still cannot.
*/
alter table public.citation_checks
  add column if not exists run_id uuid;

comment on column public.citation_checks.run_id is
  'The sweep that produced this check. Null means an ad-hoc top-up - questions asked on their own, outside a full run of the watch list - which the trend folds into the most recent run rather than plotting as its own point. Set by the server only; a run covering every watched question is a sweep, anything narrower is not.';

/* The trend reads every check for one site and groups by run, which is exactly
   this pair. Not unique: one run writes one row per question per engine. */
create index if not exists citation_checks_site_run_idx
  on public.citation_checks (site_id, run_id);


/* ------------------------------------------------------------- backfill --- */

/*
  Historical rows get one synthetic run per site per UTC day.

  ⚠️ THIS REPRODUCES WHAT THE CHART ALREADY PLOTTED, WHICH IS THE POINT. Before
  this column the trend had one point per UTC day, so keying old rows that way
  changes nothing a customer has already seen. True run boundaries are not
  recoverable after the fact — nothing recorded them, which is why this column
  exists — and inventing finer ones from timestamp gaps would be this migration
  guessing at evidence.

  ⚠️ AND THE SYNTHETIC IDS ARE REAL uuids, NOT A SENTINEL. A shared placeholder
  would merge every site's history into one run the first time somebody grouped
  without filtering by site.
*/
update public.citation_checks c
set run_id = m.run_id
from (
  select site_id,
         date_trunc('day', checked_at) as day,
         gen_random_uuid() as run_id
  from public.citation_checks
  where run_id is null
  group by site_id, date_trunc('day', checked_at)
) m
where c.run_id is null
  and c.site_id = m.site_id
  and date_trunc('day', c.checked_at) = m.day;
