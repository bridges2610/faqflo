-- Which watched competitors the owner treats as priorities.
--
-- Apply via the Supabase SQL editor, after 0001-0023.
--
-- ⚠️ RE-RUNNABLE: `add column if not exists` is a no-op the second time, and
-- nothing is backfilled — every existing row starts unstarred, which is the only
-- reading the data supports.


/* ------------------------------------------------ competitor priorities --- */

/*
  ⚠️ NO GRANT HERE, AND THAT IS THE OPPOSITE OF THE COUNTERS ON profiles.

  0021 and 0023 deliberately add columns with no grant, because 0001 revoked
  everything on public.profiles and granted back an allow-list — so a new column
  there is unwritable from a browser, which is what a spend counter needs.

  public.competitors was never revoked (see 0015), so it has no column
  allow-list: RLS alone decides, and its four owner policies already cover
  update. That is correct for this column. A star is the customer's own opinion
  about their own list, not a measurement and not an allowance — the one thing
  on this page they SHOULD be able to write. The measured counts beside it live
  in citation_checks, which is select-only.
*/
alter table public.competitors
  add column if not exists starred boolean not null default false;

comment on column public.competitors.starred is
  'Owner-set priority. Sorts a watched competitor to the top of the Competitors page, above the measured mention count. Customer data, writable by the owner through RLS — unlike the spend counters on profiles.';
