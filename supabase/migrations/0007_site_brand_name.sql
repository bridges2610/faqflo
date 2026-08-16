-- The name the engines actually say, as opposed to the name in our UI.
--
-- WHY THESE ARE NOT THE SAME COLUMN:
--
-- `sites.name` is a label the customer types into the add-site form, and most
-- people type their domain — a real account here reads "Letsroof" for a company
-- called "Segelman Shaw Roofing, Siding & Gutters". That is fine for a heading
-- and useless for measurement.
--
-- lib/tracking/classify.ts decides a `mentioned` outcome by looking for the
-- business's name in the answer text. Pointed at "Letsroof" it finds nothing,
-- and every answer that named the company in full is recorded as `absent` —
-- undercounting the customer against their own results, silently, forever.
--
-- ⚠️ SERVICE-ROLE WRITES ONLY, AND DELIBERATELY SO. This column decides what
-- counts as evidence. A browser that can set it can set it to a word that
-- appears in every answer and manufacture a perfect mention rate — into the
-- audit score, which is a number we put our name to. Same reasoning as
-- sites.get_cited_at in 0001 and citation_checks in 0006.
--
-- Written by app/api/audit/route.ts from the schema.org organisation name the
-- crawl finds (lib/audit/profile.ts). Null until an audit has run, and callers
-- fall back to `name` so tracking still works on a site that has never been
-- audited.
--
-- Apply via the Supabase SQL editor, after 0001–0006.

alter table public.sites
  add column if not exists brand_name text;

comment on column public.sites.brand_name is
  'Business name inferred by the audit, used for mention matching. Service-role writes only.';

-- No grant change needed: 0001 already limits `authenticated` UPDATE to a named
-- column list, and this column is not in it. Stated here because the absence of
-- a line is easy to read as an oversight rather than the point.
