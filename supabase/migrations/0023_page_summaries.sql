-- The AI help panel: what it has already written, and what a free account has spent.
--
-- Apply via the Supabase SQL editor, after 0001-0022.
--
-- ⚠️ RE-RUNNABLE: `add column if not exists` and `create table if not exists`
-- are no-ops the second time, every policy is dropped before it is recreated,
-- and the function is `create or replace`. The new counter is not backfilled —
-- every existing account starts at zero, which is the generous reading and the
-- only one the data supports.
--
-- ⚠️ APPLY THIS BEFORE DEPLOYING THE CODE THAT WRITES 'summary'. Until the
-- function below knows that kind, claim_free_generation() raises `unknown kind
-- summary` — which lib/auth/free-allowance.ts correctly reports as 'error'
-- rather than 'spent', but the panel still refuses to write anything. Same
-- prerequisite 0022 records for the scan stage.


/* ------------------------------------------------- free summary spend --- */

-- ⚠️ A COUNTER, NOT A ROW COUNT, for the reason 0021 gives at length: the
-- summaries table below is keyed one row per page and is OVERWRITTEN as the
-- data moves, so the rows in it never add up to what was spent. Three
-- summaries on Home leave one row behind. Only a counter that never falls can
-- say "three, ever" and mean it.
alter table public.profiles
  add column if not exists free_summaries_used integer not null default 0;

comment on column public.profiles.free_summaries_used is
  'Page summaries a free account has had written, ever. Replaying a stored summary does not count — only a real model call does. Never decremented. Service-role only.';

/*
  ⚠️ NO GRANT, AND NONE SHOULD BE ADDED. 0001 grants column privileges on
  public.profiles as an ALLOW-LIST, so a new column is already unwritable by a
  signed-in user. A browser that could zero this would have unlimited
  generation on a free account. Same reasoning 0021 records for its two
  counters and 0004 for welcomed_at.
*/


/* ------------------------------------------------------------ the claim --- */

/*
  Spend a free account's allowance, atomically, or refuse.

  Unchanged from 0021 except for the 'summary' branch. Reproduced whole rather
  than patched because `create or replace` needs the entire body, and because a
  reader landing on the newest definition should be able to see all three kinds
  without opening a second file.

  Returns how many remain after the spend, or NULL when there was not enough.
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

  elsif p_kind = 'summary' then
    update public.profiles
       set free_summaries_used = free_summaries_used + p_amount
     where id = p_user
       and free_summaries_used + p_amount <= p_cap
    returning p_cap - free_summaries_used into remaining;

  else
    raise exception 'claim_free_generation: unknown kind %', p_kind;
  end if;

  -- NULL when no row matched: the allowance is gone and nothing was spent.
  return remaining;
end;
$$;

/*
  ⚠️ REPEATED FROM 0021 BECAUSE THIS FILE MUST STAND ALONE. `create or replace`
  keeps the existing ACL, so on a database that already ran 0021 these four
  lines change nothing — but on a fresh database restored from a dump, or if
  0021's grants were ever lost, this is what keeps a browser from calling a
  SECURITY DEFINER function with p_cap => 999999.
*/
revoke all on function public.claim_free_generation(uuid, text, integer, integer) from public;
revoke all on function public.claim_free_generation(uuid, text, integer, integer) from anon;
revoke all on function public.claim_free_generation(uuid, text, integer, integer) from authenticated;
grant execute on function public.claim_free_generation(uuid, text, integer, integer) to service_role;


/* --------------------------------------------------------- the summaries --- */

/*
  One written summary per page, per site.

  ⚠️ STORED RATHER THAN DERIVED, AND THE ALLOWANCE IS WHY. Without this a free
  account burns its three by closing the panel and opening it again, and a Pro
  account pays a model call every time it visits a page. lib/dashboard/types.ts
  states the rule for ContentPlan and it applies here word for word: a screen
  that bills on every visit and shows a different answer each time "is not a
  plan so much as a slot machine".

  ⚠️ THIS IS MODEL OUTPUT, NOT CUSTOMER CONTENT, so the browser reads and never
  writes — the split 0006 drew for the evidence tables. The route writes it with
  the service role after the session, the site ownership and the plan have all
  been checked server-side. A browser that could insert here could hand itself
  unlimited summaries by writing them directly.
*/
create table if not exists public.page_summaries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites on delete cascade,
  user_id uuid not null references auth.users on delete cascade,

  -- ⚠️ STABLE BY CONSTRUCTION, the same property 0016 needs from action_id.
  -- These are the keys in lib/dashboard/summary.ts — 'home', 'audit',
  -- 'content', 'competitors', 'tracking' — not route paths, so renaming a URL
  -- does not orphan what was written about it.
  page_key text not null,

  body text not null,

  -- ⚠️ THE HONESTY COLUMN, and it plays the part report_checked_at plays in
  -- 0016. A summary describes the numbers that were on the screen when it was
  -- written. This is a hash of exactly those numbers, so the panel can tell
  -- "still true" from "stale" without asking the model, and only genuinely new
  -- data spends an allowance.
  --
  -- Stale is not hidden: the panel offers to rewrite it and says why.
  facts_hash text not null,

  created_at timestamptz not null default now(),

  -- One summary per page per site. Rewriting replaces the row rather than
  -- adding a second — there is no history and the panel offers none.
  constraint page_summaries_unique unique (site_id, page_key)
);

create index if not exists page_summaries_site_id_idx
  on public.page_summaries (site_id);

alter table public.page_summaries enable row level security;

drop policy if exists "Summaries are readable by their owner" on public.page_summaries;
create policy "Summaries are readable by their owner"
  on public.page_summaries for select
  to authenticated
  using ((select auth.uid()) = user_id);

/*
  ⚠️ NO INSERT, UPDATE OR DELETE POLICY, AND THAT IS DELIBERATE. Both layers
  say the same thing: no policy means RLS refuses the write, and the grants
  below mean the privilege was never there to begin with. 0001's note on the
  two layers explains why both are stated rather than one relied upon.
*/
revoke all on public.page_summaries from anon, authenticated;
grant select on public.page_summaries to authenticated;
