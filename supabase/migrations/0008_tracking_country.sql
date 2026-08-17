-- Which country the answer engines are asked from.
--
-- Until now every tracking run carried NO location, so each check was asked
-- from wherever the vendors default to. For a business serving one country that
-- is not a missing feature, it is a silent accuracy problem: a UK roofer was
-- being shown what a US-defaulted search returns.
--
-- ⚠️ TWO OF THREE ENGINES, AND THE THIRD MUST NOT BE MISREPRESENTED.
--
--   ChatGPT     user_location on the web_search tool. Verified against the live
--               API: GB returned .co.uk roofing directories where US returned
--               US ones, with zero overlap between the two source lists.
--   Perplexity  web_search_options.user_location. Verified the same way.
--   Gemini      CANNOT be targeted. `userLocation` is rejected outright
--               ("Unknown name"), and toolConfig.retrievalConfig.latLng is
--               accepted but does not localise — London coordinates returned
--               thisoldhouse.com, angi.com and gaf.com with no .uk host at all
--               on a question a UK search would fill with them. Any screen
--               showing a country must exclude Gemini rather than imply it.
--
-- Apply via the Supabase SQL editor, after 0001–0007.


/* ------------------------------------------------------- the preference --- */

-- ISO 3166-1 alpha-2, or null for "not set".
--
-- ⚠️ NULL IS A REAL STATE AND MUST STAY ONE. It means "send no location", which
-- is exactly today's behaviour, and the UI says so. Defaulting it — or guessing
-- from sites.location, which holds free text like 'Rockland County, NY' — would
-- present an inference as a setting, and would be wrong for precisely the
-- customers who care enough to look.
alter table public.sites
  add column if not exists country text;

comment on column public.sites.country is
  'ISO 3166-1 alpha-2 the engines are asked from. Null = no location sent.';

-- ⚠️ CUSTOMER-SETTABLE, UNLIKE brand_name IN 0007. That column decides what
-- counts as evidence, so the browser may not write it. This one is a statement
-- about which market they sell into — their answer to give, not ours.
--
-- 0001 grants UPDATE on a named column list rather than the whole table, so a
-- new column is unwritable until it is named here.
grant update (country) on public.sites to authenticated;


/* ------------------------------------------- what each check was asked as --- */

-- ⚠️ STAMPED PER ROW, FOR THE SAME REASON audit_runs.depth IS.
--
-- That column exists because "a quick run scores 3 findings across 2 pillars; a
-- full run scores ~40 across 6 — they are not the same measurement and plotting
-- them on one line shows a cliff that is not a change to the customer's site."
-- A check asked from the US and one asked from the UK are likewise not the same
-- measurement. Without this, changing the setting would silently splice two
-- different questions into one trend.
--
-- Null on every row written before this landed, and on every Gemini row, which
-- is the honest record in both cases: those were not asked from anywhere in
-- particular.
alter table public.citation_checks
  add column if not exists country text;

comment on column public.citation_checks.country is
  'Country this check was asked from. Null = no location was sent (or the engine ignores it).';

-- No grant change: citation_checks stays SELECT-only for `authenticated`, and
-- rows are written by the service role from app/api/dashboard/tracking/route.ts.
-- See 0006 — this table is the product''s evidence.
