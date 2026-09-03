-- Topics for answer sets, and questions that belong to an article.
--
-- WHAT THIS ADDS:
--
--   1. faqs.topic — the model's name for one generated set, so the Answers list
--      can show one row per topic instead of a flat pile.
--   2. articles.faqs — questions and answers that belong to ONE article. They
--      sit at the foot of it, go out inside its paste block, and are deleted
--      with it.
--
-- Apply via the Supabase SQL editor, after 0001-0017.
--
-- ⚠️ RE-RUNNABLE. Both statements are `add column if not exists`, so a second
-- run is a no-op and cannot touch a row of customer content.


/* ------------------------------------------------------ faq set topics --- */

-- ⚠️ A LABEL FOR ONE GENERATION RUN, NOT A CATEGORY SOMEBODY PICKS FROM A LIST.
-- The model returns a short name with each batch and every answer in that batch
-- carries the same string. Nothing validates it against a vocabulary, because
-- there isn't one — the whole point is that it describes whatever was asked for.
--
-- ⚠️ NULLABLE, AND EXISTING ROWS ARE DELIBERATELY LEFT NULL. Every answer
-- written before this column existed has no batch to name, and a hand-written
-- answer never had one. Backfilling a guess would put somebody's own writing
-- under a heading a model invented for it. The dashboard buckets nulls into
-- "Written by you" or "Earlier answers" depending on faqs.source, which is a
-- distinction it can actually make.
alter table public.faqs
  add column if not exists topic text;

comment on column public.faqs.topic is
  'Model-supplied name for the generated set this answer came from. Null for hand-written answers and for anything predating 0018.';


/* ---------------------------------------------------- faqs on articles --- */

-- ⚠️ THESE ARE NOT public.faqs ROWS, AND THAT IS THE WHOLE CHANGE. A faqs row
-- belongs to a group — a page of the customer's site — carries a publish status
-- and a position, and reaches the site through that group's paste block. It also
-- shows up on the Answers tab, which is exactly what these must not do.
--
-- An article's questions are written from its finished text, sit at the bottom
-- of it, travel inside its own paste block, and are deleted with it. Storing
-- them as faqs rows would give one thing two owners and put it in two lists.
--
-- jsonb for the same reason articles.sections is jsonb: nothing queries inside
-- it. Shape is [{ "q": "...", "a": "..." }], enforced by the JSON schema the
-- model is held to and defended again in rowToArticle(), not by a constraint
-- here — see the note on sections in 0017.
alter table public.articles
  add column if not exists faqs jsonb not null default '[]'::jsonb;

comment on column public.articles.faqs is
  'Q&As belonging to this article. Rendered at its foot and included in its paste block and schema. Never shown in the Answers list.';

-- No RLS changes: both columns sit on tables whose four owner policies were
-- created in 0009 and 0017, and a policy is per-table, not per-column.
