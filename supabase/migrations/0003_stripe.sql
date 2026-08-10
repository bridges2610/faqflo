-- Stripe: the customer link, and the idempotency ledger.
--
-- 0001 locked `sites.get_cited_at` and `profiles.subscription` away from the
-- `authenticated` role and said the service role would write them "which is
-- where the Stripe webhook will write them". This is the schema that webhook
-- needs.
--
-- Apply via the Supabase SQL editor, after 0001 and 0002.

/* --------------------------------------------------- customer link --- */

-- Ties an account to its Stripe customer.
--
-- Needed in both directions: checkout looks it up to avoid creating a second
-- customer for the same person, and subscription webhooks arrive knowing only
-- the Stripe customer, so this is how they find the profile to update.
--
-- Unique because two profiles sharing a customer would make that reverse
-- lookup ambiguous, and the ambiguity would only show up as one account's
-- subscription silently landing on another's.
alter table public.profiles
  add column if not exists stripe_customer_id text unique;

-- Deliberately NOT granted to `authenticated`. The column grants in 0001 list
-- exactly what a signed-in user may write to `profiles` (`name`, and nothing
-- else), and this stays outside that list: a browser that can rewrite its own
-- Stripe customer id can point its billing at somebody else's.

/* ---------------------------------------------- idempotency ledger --- */

-- Every Stripe event we have already acted on.
--
-- Stripe retries delivery for up to three days, does not guarantee ordering,
-- and its own guidance is blunt that a fulfilment function "might be called
-- multiple times, possibly concurrently, for the same Checkout Session".
-- Without this table, a retried `checkout.session.completed` would re-run
-- fulfilment — and for anything that is not a pure overwrite, that is a
-- double-grant or a double-charge.
--
-- The handler inserts here FIRST and treats a unique violation as "already
-- handled". That is stronger than checking-then-writing, which has a race
-- between the check and the write that concurrent retries will eventually find.
create table if not exists public.stripe_events (
  id text primary key,               -- Stripe's event id, evt_…
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

-- No policies and no grants, on purpose. RLS with zero policies denies every
-- role that is subject to it; the service role bypasses RLS entirely and is
-- the only thing that touches this table. Nothing here belongs to a customer,
-- so there is nobody to grant it to.
revoke all on public.stripe_events from anon, authenticated;
