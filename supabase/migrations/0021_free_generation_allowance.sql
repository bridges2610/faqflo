-- What a free account has already spent on the model.
--
-- Apply via the Supabase SQL editor, after 0001-0020.
--
-- ⚠️ RE-RUNNABLE: `add column if not exists` is a no-op the second time, and
-- neither column is backfilled — every existing account starts at zero, which
-- is the generous reading and the only one the data supports.


/* ------------------------------------------------- free generation spend --- */

-- ⚠️ COUNTERS, NOT ROW COUNTS, AND THE DIFFERENCE IS THE WHOLE POINT.
--
-- Pro's article allowance is derived by counting `articles` rows inside the
-- billing month. That works there because the leak is small and self-limiting.
-- It cannot work for free, because articles and answers are HARD-deleted
-- (lib/dashboard/store.ts) — so a row count refunds the allowance the moment
-- somebody deletes what they made, and "one article, ever" becomes one article
-- at a time, forever, for nothing.
--
-- ARTICLE_CAP's own note in lib/dashboard/plans.ts already states the rule this
-- follows: "Deleting an article does not give the month back: the model call is
-- what cost money, and it already happened." These columns are what make that
-- true for the free tier rather than merely written down.
alter table public.profiles
  add column if not exists free_articles_used integer not null default 0;

alter table public.profiles
  add column if not exists free_faq_sets_used integer not null default 0;

/*
  ⚠️ AN EARLIER DRAFT OF THIS MIGRATION CALLED IT free_faqs_used AND COUNTED
  ANSWERS. The allowance is five SETS — five generation runs in the Answers tab —
  so the column had to be renamed rather than reinterpreted: a counter whose name
  says answers and whose contents mean runs is a bug waiting for whoever reads it
  next.

  Written as add-then-drop rather than `rename column` so this file is correct
  whether or not that draft was ever applied. Dropping a column that does not
  exist is a no-op; so is adding one that does.
*/
alter table public.profiles
  drop column if exists free_faqs_used;

comment on column public.profiles.free_articles_used is
  'Articles a free account has generated, ever. Never decremented — deleting an article does not refund the model call. Service-role only.';

comment on column public.profiles.free_faq_sets_used is
  'Generation runs a free account has spent in the Answers tab, ever. Counts RUNS, not answers — one run writes 3-12. An article''s own FAQs are exempt and never counted here. Never decremented. Service-role only.';

/*
  ⚠️ NO GRANT, AND NONE SHOULD BE ADDED.

  0001 grants column privileges as an ALLOW-LIST — `grant update (name) on
  public.profiles to authenticated` and nothing else — so a new column is
  already unwritable by a signed-in user. That is exactly what is wanted here:
  a browser that could zero either of these would have unlimited generation on
  a free account. Same reasoning 0004 records for welcomed_at.

  ⚠️ AND THE INCREMENT IS A CONDITIONAL UPDATE, NOT A READ THEN A WRITE. The
  routes claim the spend the way welcomeOnce() and claimEvent() claim theirs:

    update public.profiles
       set free_faq_sets_used = free_faq_sets_used + $2
     where id = $1 and free_faq_sets_used + $2 <= 5
    returning free_faq_sets_used;

  No row means the allowance is gone and nothing was spent. Checking first and
  writing after would let two requests arriving together both pass the check —
  select-then-write loses to concurrency, only the write can arbitrate.
*/


/* ------------------------------------------------------------ the claim --- */

/*
  Spend a free account's allowance, atomically, or refuse.

  ⚠️ A FUNCTION BECAUSE PostgREST CANNOT WRITE `set col = col + n`. A plain
  update through the client can only set a literal, so the app would have to
  read, add and write — three steps a second request slips between. 0010, 0011
  and 0012 all reach for a function for the same reason, and this follows their
  shape: SECURITY DEFINER with a fixed search_path so the body cannot be
  redirected by a caller's setting.

  Returns how many remain after the spend, or NULL when there was not enough —
  the same "no row means somebody else won" contract claim_due_checks() uses.

  ⚠️ THE CAP IS A PARAMETER SO THE NUMBER LIVES IN ONE PLACE, and that is only
  safe because of the REVOKE below. lib/dashboard/plans.ts owns
  FREE_ARTICLE_CAP and FREE_GENERATED_FAQ_CAP; hardcoding them here would be a
  second copy to forget. But a caller who could pass their own cap could grant
  themselves any allowance they liked, so this must never be reachable by
  anything holding a browser's token.
*/
create or replace function public.claim_free_generation(
  p_user uuid,
  p_kind text,
  p_amount integer,
  p_cap integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  remaining integer;
begin
  if p_amount <= 0 then
    raise exception 'claim_free_generation: amount must be positive, got %', p_amount;
  end if;

  if p_kind = 'article' then
    update public.profiles
       set free_articles_used = free_articles_used + p_amount
     where id = p_user
       and free_articles_used + p_amount <= p_cap
    returning p_cap - free_articles_used into remaining;

  elsif p_kind = 'faq_set' then
    update public.profiles
       set free_faq_sets_used = free_faq_sets_used + p_amount
     where id = p_user
       and free_faq_sets_used + p_amount <= p_cap
    returning p_cap - free_faq_sets_used into remaining;

  else
    raise exception 'claim_free_generation: unknown kind %', p_kind;
  end if;

  -- NULL when no row matched: the allowance is gone and nothing was spent.
  return remaining;
end;
$$;

/*
  ⚠️ SERVICE ROLE ONLY, AND THIS IS THE LINE THAT MAKES THE CAP PARAMETER SAFE.

  A SECURITY DEFINER function is executable by PUBLIC unless revoked, so without
  this a signed-in browser could call it with p_cap => 999999 and write itself
  an unlimited allowance — through a function that runs as the owner and
  therefore ignores the column grants that were supposed to protect these
  counters. Revoke first, then grant the one role that is never in a browser.
*/
revoke all on function public.claim_free_generation(uuid, text, integer, integer) from public;
revoke all on function public.claim_free_generation(uuid, text, integer, integer) from anon;
revoke all on function public.claim_free_generation(uuid, text, integer, integer) from authenticated;
grant execute on function public.claim_free_generation(uuid, text, integer, integer) to service_role;
