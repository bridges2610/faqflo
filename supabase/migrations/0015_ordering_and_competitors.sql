-- Two things the dashboard redesign needs and the schema cannot express.
--
-- WHAT THIS ADDS:
--
--   1. questions.position — an explicit order for the AI Mentions list.
--   2. public.competitors — the rivals a customer NAMES, as opposed to the
--      ones we measured.
--
-- ⚠️ SAFE TO RE-RUN. Every statement is guarded: `add column if not exists`,
-- `create table if not exists`, and policies dropped before they are recreated.
-- Running it twice changes nothing the second time.
--
-- ⚠️ NEITHER CHANGE TOUCHES EVIDENCE. citation_checks and audit_runs stay
-- SELECT-only to the browser for the reason 0009 gives: they are measurements,
-- and a customer editing them would be editing the record of what we saw. Both
-- objects below are customer content, so both get full CRUD under RLS — the
-- same split 0009 drew.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ordering for the tracked question list
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The list is read `.order('added_at')` today, which is the order the model
-- happened to return them in. The redesign lets the owner drag them, so the
-- order has to be a value rather than an accident.
--
-- ⚠️ MODELLED ON faqs.position, DELIBERATELY. That column has carried the same
-- job since 0009 and the store already knows the swap-two-positions idiom for
-- it. A second ordering scheme in the same store would be one to get wrong.
--
-- ⚠️ THE BACKFILL PRESERVES WHAT PEOPLE ALREADY SEE. Defaulting every existing
-- row to 0 would leave the order to whatever the database returned that day,
-- which is a silent reshuffle of a list customers have already read. Numbering
-- by added_at per site reproduces exactly the order the old query produced.

alter table public.questions
  add column if not exists position integer not null default 0;

comment on column public.questions.position is
  'Ordering on the AI Mentions page. Reordering swaps two positions rather than renumbering the list, the same idiom faqs.position uses.';

update public.questions q
set position = ranked.rn
from (
  select id, (row_number() over (partition by site_id order by added_at, id)) - 1 as rn
  from public.questions
) as ranked
where q.id = ranked.id
  and q.position = 0
  and ranked.rn <> 0;

create index if not exists questions_site_position_idx
  on public.questions (site_id, position);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The competitors a customer names
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ THIS IS NOT THE "who AI read instead" LIST, AND THE TWO MUST NOT MERGE.
-- That list is derived: it is every domain the engines actually cited, counted
-- from citation_checks, and it has no rows of its own precisely because nobody
-- chose its contents. This table is the opposite — a short list of businesses
-- the owner says they compete with. We then report how often each was cited,
-- from the same measurements.
--
-- The distinction is load-bearing on screen. A watch-list row with no citations
-- must read as a measured zero ("AI never mentioned them"), never as blank or
-- missing, because the absence IS the finding the owner asked us to watch for.
--
-- No citations column here for the same reason: storing a count would let this
-- table drift from citation_checks, which is the only thing that knows.

create table if not exists public.competitors (
  id text primary key,
  site_id uuid not null references public.sites on delete cascade,
  user_id uuid not null references auth.users on delete cascade,

  -- What the owner calls them. Free text: "Summit Roofing".
  name text not null,

  -- ⚠️ BARE HOST, NO SCHEME AND NO TRAILING SLASH — matching sites.domain, and
  -- matching how the measured list keys its rows. The two are compared by this
  -- value to attach a citation count to a watched competitor, so a stored
  -- "https://summit.com/" would silently never match.
  domain text not null,

  -- Ordering on the Competitors page. Same idiom as faqs.position.
  position integer not null default 0,
  created_at timestamptz not null default now(),

  -- One row per rival per site. Watching the same domain twice would double it
  -- in the list and split nothing, since the count comes from elsewhere.
  constraint competitors_unique_per_site unique (site_id, domain)
);

create index if not exists competitors_site_id_idx on public.competitors (site_id);
create index if not exists competitors_site_position_idx
  on public.competitors (site_id, position);

alter table public.competitors enable row level security;

drop policy if exists "Competitors are readable by their owner" on public.competitors;
create policy "Competitors are readable by their owner"
  on public.competitors for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Competitors are insertable by their owner" on public.competitors;
create policy "Competitors are insertable by their owner"
  on public.competitors for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Competitors are updatable by their owner" on public.competitors;
create policy "Competitors are updatable by their owner"
  on public.competitors for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Competitors are deletable by their owner" on public.competitors;
create policy "Competitors are deletable by their owner"
  on public.competitors for delete
  to authenticated
  using ((select auth.uid()) = user_id);
