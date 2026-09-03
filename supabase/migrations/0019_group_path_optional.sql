-- A set of answers can exist before anyone has decided which page it goes on.
--
-- Apply via the Supabase SQL editor, after 0001-0018.
--
-- ⚠️ RE-RUNNABLE: dropping a NOT NULL that is already dropped is a no-op.


/* ------------------------------------------------- unplaced answer sets --- */

-- ⚠️ THIS IS ABOUT NOT MAKING A CLAIM WE CANNOT BACK.
--
-- A group is now created the moment a set of answers is generated, which is
-- long before the owner has chosen where to paste it. With `path` NOT NULL,
-- creating one meant inventing a slug — "/roof-replacement-costs" — and the
-- exported JSON-LD would then carry:
--
--     "@id": "https://theirsite.com/roof-replacement-costs#faq"
--
-- asserting to every assistant that reads it that the page exists. It very
-- likely does not. The comment on this column in 0009 says the path "decides
-- where the answers may correctly claim to live"; a guessed one inverts that
-- from a fact into a fabrication, on the customer's own domain.
--
-- Null means "not placed yet". buildSchemaJson() omits @id and url entirely in
-- that case, which is the same thing buildArticleSchemaJson() already does for
-- an article that has no stored path. The block still copies; it just names no
-- page until there is one to name.
alter table public.faq_groups
  alter column path drop not null;

comment on column public.faq_groups.path is
  'Path on the site this set is pasted at, leading slash, no origin. NULL until the owner chooses one — the export omits @id and url rather than guessing.';

-- ⚠️ THE UNIQUE INDEX IS DELIBERATELY LEFT ALONE, and it keeps working. Two
-- groups still cannot share a real path — that constraint is what stops two
-- paste blocks claiming one page — but Postgres does not treat two NULLs as
-- equal, so any number of unplaced sets coexist under it. Nothing to change.
--
--     constraint faq_groups_path_unique_per_site unique (site_id, path)
--
-- Existing rows are untouched: every group made before this has a real path and
-- keeps it.
