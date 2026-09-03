-- Articles, and the ability to wave a question away.
--
-- WHAT THIS ADDS:
--
--   1. public.articles — the generated long-form pieces. New in this release;
--      Answers could only ever make short question-and-answer pairs before.
--   2. questions.dismissed — the owner saying they will never answer this one.
--
-- Apply via the Supabase SQL editor, after 0001-0016.
--
-- ⚠️ RE-RUNNABLE, LIKE 0009 AND FOR THE SAME REASON. Postgres has no
-- `create policy if not exists`, so every policy is dropped before it is
-- created. The table itself keeps its `create table if not exists` guard, so a
-- second run cannot touch a row of customer content. A migration that is
-- re-runnable because it deletes data is worse than one that refuses to run
-- twice.


/* -------------------------------------------------------------- articles --- */

-- ⚠️ TEXT IDS, NOT uuid, MATCHING faq_groups AND faqs. Ids are minted in the
-- browser by newId() because every mutation builds the next whole snapshot
-- locally and hands it to the provider in one setState. A uuid default would
-- mean the database knowing an id the snapshot does not, so every insert would
-- need a read-back before the UI could render. See the long note in 0009.
create table if not exists public.articles (
  id text primary key,
  site_id uuid not null references public.sites on delete cascade,
  -- Carried for RLS, so a policy is a column comparison rather than a join.
  user_id uuid not null references auth.users on delete cascade,

  title text not null,
  -- The opening, before the first heading.
  intro text not null default '',

  -- ⚠️ jsonb, NOT A CHILD TABLE, AND THE TEST IS THE ONE audit_runs.report AND
  -- content_plans.plan ARE STORED UNDER: nothing queries inside it. An article
  -- is read whole to render one card and build one paste block. A sections
  -- table would buy ordering guarantees for rows only ever read as a unit and
  -- cost a join on every dashboard load.
  --
  -- Shape is [{ "heading": "...", "body": "..." }]. Enforced by the JSON schema
  -- the model is held to (articleSchema in lib/article.ts) and defended again
  -- in rowToArticle(), not by a constraint here — see the note on tone and
  -- language in 0009 for why a CHECK on a shape that is expected to grow turns
  -- a small change into a migration nobody remembers is needed.
  sections jsonb not null default '[]'::jsonb,

  -- What the owner typed as a brief, or null when they just pressed the button.
  brief text,

  -- ⚠️ MEASURED BY countWords() AT GENERATION TIME, NEVER THE MODEL'S OWN
  -- COUNT. A language model asked how many words it wrote will answer, and it
  -- will be wrong.
  word_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ⚠️ THE MONTHLY ALLOWANCE IS COUNTED OFF THIS INDEX. The route counts rows
-- with user_id = ? and created_at >= the start of the billing month, on every
-- generation, before it will spend a model call. See ARTICLE_CAP in
-- lib/dashboard/plans.ts.
create index if not exists articles_user_created_idx
  on public.articles (user_id, created_at desc);

create index if not exists articles_site_id_idx on public.articles (site_id);

comment on table public.articles is
  'Generated long-form articles. Counted per billing month against ARTICLE_CAP; a deleted row still counts, because the model call is what was paid for.';


/* ---------------------------------------------------- dismissed questions --- */

-- ⚠️ NOT A KIND OF `covered`, AND MERGING THE TWO WOULD LIE TWICE. `covered`
-- means the site answers it, and it feeds the "x of y answered" figure and the
-- coverage recheck. Dismissed means the opposite: nobody is going to answer it.
-- Folding it into `covered` would inflate the answered count and let the
-- coverage recheck un-dismiss it.
--
-- ⚠️ IT MUST SURVIVE A DISCOVER RE-RUN. addQuestions() in 'replace' mode keeps
-- covered, manual AND dismissed rows. Drop it from that predicate and the
-- Ignore button works until the next discovery run, at which point the question
-- comes straight back.
alter table public.questions
  add column if not exists dismissed boolean not null default false;

comment on column public.questions.dismissed is
  'The owner will never answer this. Kept rather than deleted so a Discover re-run cannot re-propose it, and so the choice is undoable.';


/* ------------------------------------------------------------------- RLS --- */

-- RLS is the actual boundary. Everything the app does on top of it is
-- convenience: if a policy here is wrong, no amount of checking in a route
-- handler makes the data safe.
--
-- Full CRUD for the owner, matching faqs and faq_groups in 0009: this is
-- customer content, not evidence. Compare citation_checks and audit_runs, which
-- are SELECT-only for `authenticated` because a browser that could write them
-- could manufacture a citation history we put our name to.

alter table public.articles enable row level security;

drop policy if exists "Articles are readable by their owner" on public.articles;
create policy "Articles are readable by their owner"
  on public.articles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Articles are insertable by their owner" on public.articles;
create policy "Articles are insertable by their owner"
  on public.articles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Articles are updatable by their owner" on public.articles;
create policy "Articles are updatable by their owner"
  on public.articles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Articles are deletable by their owner" on public.articles;
create policy "Articles are deletable by their owner"
  on public.articles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ⚠️ NO COLUMN-LEVEL GRANT RESTRICTIONS, unlike sites. Nothing here decides
-- what the customer is owed. The one thing that does — how many articles they
-- have left this month — is not a column: it is a COUNT taken server-side with
-- the service role, over rows a customer may freely write. Writing an extra row
-- would let somebody spend their own allowance faster, which is not an attack.
