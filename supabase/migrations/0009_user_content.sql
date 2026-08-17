-- The customer's own work, moved out of their browser.
--
-- WHAT THIS REPLACES:
--
-- FAQ groups, the answers themselves, and discovered questions have lived in
-- one localStorage key — `faqflo.dashboard.v5.<userId>` — since the dashboard
-- was built. lib/dashboard/store.ts:1 has always named this as temporary:
-- "Today that's localStorage. Tomorrow it's Supabase." This is tomorrow.
--
-- Two reasons it can no longer wait:
--
--   1. It is the customer's only copy. Clear the browser, switch laptop, or
--      open the site on a phone, and the answers they wrote are gone. There is
--      no export and no backup. For paid accounts that is a data-loss bug
--      wearing a feature's clothes.
--   2. Nothing on the server can read it. The onboarding scan runs server-side
--      and must write discovered questions somewhere the browser is not.
--
-- ⚠️ THESE ARE CUSTOMER CONTENT, NOT EVIDENCE — which is why the browser gets
-- full CRUD here, unlike citation_checks and audit_runs. Those two are SELECT
-- only for `authenticated` because a browser that could write them could
-- manufacture its own citation history and feed it into a score we put our
-- name to (see 0005 and 0006). Nothing of the sort applies to a customer's own
-- FAQ text: they wrote it, they may change it, and RLS is the whole boundary.
--
-- Apply via the Supabase SQL editor, after 0001-0008.


/* --------------------------------------------------------------- groups --- */

-- ⚠️ TEXT IDS, NOT uuid, AND THE STORE STILL MINTS THEM.
--
-- Ids here are made in the browser by newId() — "grp_a3f9k2" — because every
-- mutation builds the next whole snapshot locally and hands it to the provider
-- in one setState. A uuid default would mean the database knowing an id the
-- snapshot does not, so every insert would need a read-back before the UI could
-- render, and the one-time localStorage import would have to remap every
-- group→answer link rather than copying rows across.
--
-- The generator was strengthened to crypto.randomUUID() in the same change, so
-- these are collision-free from here on; the short ids already in customers'
-- browsers import unchanged, which is the point.
create table if not exists public.faq_groups (
  id text primary key,
  site_id uuid not null references public.sites on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  -- What the customer calls it: "Service page".
  name text not null,
  -- Path only, leading slash, no origin — "/services".
  --
  -- Deliberately not a full URL: the site row already owns the domain, and
  -- storing an absolute URL here would let the two disagree. The export would
  -- then emit schema pointing at a domain the customer does not own.
  path text not null,
  position integer not null default 0,
  -- When this group's export was last marked as pasted onto the live page.
  published_at timestamptz,
  -- Fingerprint of the answers at the moment they were pasted. Comparing it
  -- with the current set is what powers the "your live copy is out of date"
  -- nudge — the content is re-pasted by hand, so drift is expected and has to
  -- be visible rather than assumed away.
  published_hash text,
  created_at timestamptz not null default now(),

  -- ⚠️ This constraint IS the DuplicatePath error in store.ts. Two groups on
  -- one path would produce two exports fighting over the same page.
  constraint faq_groups_path_unique_per_site unique (site_id, path)
);

create index if not exists faq_groups_site_id_idx on public.faq_groups (site_id);


/* ---------------------------------------------------------------- faqs --- */

create table if not exists public.faqs (
  id text primary key,
  -- The group owns the answer; the group knows its site. There is no site_id
  -- here on purpose — a second path to the same fact is a second thing that
  -- can disagree with the first.
  group_id text not null references public.faq_groups on delete cascade,
  -- Carried for RLS only, so a policy is a column comparison rather than a
  -- join back through faq_groups on every row read.
  user_id uuid not null references auth.users on delete cascade,
  question text not null,
  answer text not null,
  -- ⚠️ Only 'published' entries reach the export and the schema markup.
  status text not null default 'draft',
  -- Ordering WITHIN the group. Reordering swaps two positions rather than
  -- relying on array index, which would not survive a real ORDER BY.
  position integer not null default 0,
  source text not null default 'generated',
  tone text,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint faqs_status_valid check (status in ('published', 'draft')),
  constraint faqs_source_valid check (source in ('generated', 'manual', 'discovered'))
);

create index if not exists faqs_group_id_idx on public.faqs (group_id);

-- No CHECK on tone or language. Both come from const arrays in lib/faq.ts that
-- are expected to grow, and a constraint here would turn "we added Italian"
-- into a migration nobody remembers is needed. status and source are different:
-- both are load-bearing branches in the export, and neither has changed.


/* ----------------------------------------------------------- questions --- */

create table if not exists public.questions (
  id text primary key,
  site_id uuid not null references public.sites on delete cascade,
  user_id uuid not null references auth.users on delete cascade,

  -- ⚠️ BYTE-IDENTICAL TO tracked_prompts.question. The dashboard closes the
  -- answer loop by joining these two by plain string equality — see the
  -- warning on that column in 0006. Do not trim, normalise or case-fold on the
  -- way in; the matching is done on the value exactly as the model returned it.
  question text not null,

  -- One sentence on why answering this would help this business get cited.
  why text,
  -- What the asker is after — pricing, service, trust, logistics, problem.
  intent text,
  -- Whether an existing published answer already covers it.
  covered boolean not null default false,

  -- ⚠️ LOAD-BEARING FOR SURVIVAL, NOT DECORATION. A Discover re-run replaces
  -- the uncovered questions: right for a model's suggestions, which is what a
  -- re-run produces a better version of, and wrong for something a person
  -- typed. The store keeps 'manual' rows through a replace for that reason.
  source text not null default 'discovered',
  added_at timestamptz not null default now(),

  constraint questions_source_valid check (source in ('discovered', 'manual')),
  constraint questions_unique_per_site unique (site_id, question)
);

create index if not exists questions_site_id_idx on public.questions (site_id);

-- `volume` is deliberately absent. It was rendered as "About 480 asks a month"
-- and no such measurement exists in this product — no keyword provider, no
-- engine sampling. It survives as an optional field on the TS type only so an
-- old stored snapshot still parses. It must not gain a column here.


/* ------------------------------------------------------ content plans --- */

-- One plan per site; regenerating overwrites, which is what the UI already
-- does. Included here for one reason: leaving a single field behind in
-- localStorage would mean keeping the whole browser-storage layer alive to
-- serve it, and a store that is half Postgres and half localStorage is worse
-- than either end state.
--
-- A plan is regenerable, unlike the answers above — but it costs an Opus call
-- and a minute to regenerate, so losing it when the customer switches browser
-- is the same bug in a cheaper suit.
create table if not exists public.content_plans (
  id text primary key,
  site_id uuid not null references public.sites on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  -- Read whole, never queried into — same reasoning as audit_runs.report.
  plan jsonb not null,
  created_at timestamptz not null default now(),

  constraint content_plans_one_per_site unique (site_id)
);


/* -------------------------------------- the audit report, made durable --- */

-- The score row has been in audit_runs since 0005; the REPORT — pages,
-- findings, pillars, everything the Audit page actually renders — has only
-- ever been in localStorage.
--
-- Two things fall out of adding it here:
--
--   1. Navigating away mid-crawl no longer discards the result. The report is
--      written server-side in the after() block that already inserts the score
--      row, so it lands whether or not the tab is still open.
--   2. The onboarding scan can run question discovery. lib/dashboard/discover.ts
--      refuses without `pages`, and until now `pages` existed only in the
--      browser — so a server-side scan could not have fed it at all.
--
-- jsonb rather than a table: nothing queries inside it. It is read whole, by
-- one site, to render one page.
alter table public.audit_runs
  add column if not exists report jsonb;

comment on column public.audit_runs.report is
  'Full AuditReport blob. Read whole; never queried into. Service-role writes only.';


/* ------------------------------------------------------------------ RLS --- */

-- RLS is the actual boundary. Everything the app does on top of it is
-- convenience: if a policy here is wrong, no amount of checking in a route
-- handler makes the data safe.
--
-- ⚠️ EVERY POLICY IS DROPPED FIRST, AND THAT IS WHAT MAKES THIS FILE
-- RE-RUNNABLE. Postgres has no `create policy if not exists`, so without these
-- a second run dies at the first one with 42710 — which is precisely why
-- `supabase db push` cannot be used against this project at all: 0001-0006
-- carry eleven unguarded `create policy` and `create trigger` statements
-- between them. This migration creates four tables and sixteen policies, so it
-- is the one most likely to be interrupted partway and need another go.
--
-- ⚠️ `drop policy`, never `drop table`. The tables keep their
-- `create table if not exists` guard so that re-running this file cannot touch
-- a single row of customer content. A migration that is re-runnable because it
-- deletes data is worse than one that refuses to run twice.

alter table public.faq_groups enable row level security;
alter table public.faqs enable row level security;
alter table public.questions enable row level security;
alter table public.content_plans enable row level security;

drop policy if exists "Groups are readable by their owner" on public.faq_groups;
create policy "Groups are readable by their owner"
  on public.faq_groups for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Groups are insertable by their owner" on public.faq_groups;
create policy "Groups are insertable by their owner"
  on public.faq_groups for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Groups are updatable by their owner" on public.faq_groups;
create policy "Groups are updatable by their owner"
  on public.faq_groups for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Groups are deletable by their owner" on public.faq_groups;
create policy "Groups are deletable by their owner"
  on public.faq_groups for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Faqs are readable by their owner" on public.faqs;
create policy "Faqs are readable by their owner"
  on public.faqs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Faqs are insertable by their owner" on public.faqs;
create policy "Faqs are insertable by their owner"
  on public.faqs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Faqs are updatable by their owner" on public.faqs;
create policy "Faqs are updatable by their owner"
  on public.faqs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Faqs are deletable by their owner" on public.faqs;
create policy "Faqs are deletable by their owner"
  on public.faqs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Questions are readable by their owner" on public.questions;
create policy "Questions are readable by their owner"
  on public.questions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Questions are insertable by their owner" on public.questions;
create policy "Questions are insertable by their owner"
  on public.questions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Questions are updatable by their owner" on public.questions;
create policy "Questions are updatable by their owner"
  on public.questions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Questions are deletable by their owner" on public.questions;
create policy "Questions are deletable by their owner"
  on public.questions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Content plans are readable by their owner" on public.content_plans;
create policy "Content plans are readable by their owner"
  on public.content_plans for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Content plans are insertable by their owner" on public.content_plans;
create policy "Content plans are insertable by their owner"
  on public.content_plans for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Content plans are updatable by their owner" on public.content_plans;
create policy "Content plans are updatable by their owner"
  on public.content_plans for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Content plans are deletable by their owner" on public.content_plans;
create policy "Content plans are deletable by their owner"
  on public.content_plans for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ⚠️ No column-level GRANT restrictions on these four, unlike sites. There is
-- no entitlement column here — nothing a customer could set on their own FAQ
-- text would grant them a paid tier. Compare sites.get_cited_at in 0001 and
-- sites.brand_name in 0007, both of which decide what the customer is owed or
-- what counts as evidence, and are service-role only for that reason.
