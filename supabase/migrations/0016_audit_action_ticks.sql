-- Which fixes the customer says they have done.
--
-- The audit's action plan is a short ordered list — "let AI crawlers in",
-- "answer the questions you're missing". Reading it is one thing; working
-- through it over a week is another, and until now the report had no memory of
-- which ones had been dealt with.
--
-- ⚠️ SAFE TO RE-RUN. create table if not exists, and every policy is dropped
-- before it is recreated.
--
-- ⚠️ THIS IS CUSTOMER CONTENT, NOT EVIDENCE, so the browser gets full CRUD —
-- the same split 0009 drew. A tick is the customer telling us something; it is
-- not a measurement, and nothing derived from it may be presented as one.

create table if not exists public.audit_action_ticks (
  id text primary key,
  site_id uuid not null references public.sites on delete cascade,
  user_id uuid not null references auth.users on delete cascade,

  -- ⚠️ STABLE BY CONSTRUCTION, WHICH IS THE ONLY REASON THIS TABLE WORKS.
  -- Action ids are the RECIPES constants in lib/audit/actions.ts —
  -- 'unblock-crawlers', 'server-render', 'publish-answers' — not per-run ids.
  -- A tick therefore still refers to the same fix after the next scan.
  action_id text not null,

  -- ⚠️ THE HONESTY COLUMN. A tick belongs to the audit that raised it. The UI
  -- honours a tick only when this matches the current report's checked_at, so a
  -- newer scan clears the slate.
  --
  -- Without it: someone ticks "let AI crawlers in", never does it, the next
  -- scan still finds crawlers blocked, and the report shows the fix complete
  -- while the finding underneath it still fails. The audit re-measures every
  -- time; whatever it still lists is still not done, and the report must never
  -- argue with its own scan.
  report_checked_at timestamptz not null,

  created_at timestamptz not null default now(),

  -- One tick per fix per site. Re-ticking after a new scan updates the row's
  -- report_checked_at rather than adding a second.
  constraint audit_action_ticks_unique unique (site_id, action_id)
);

create index if not exists audit_action_ticks_site_id_idx
  on public.audit_action_ticks (site_id);

alter table public.audit_action_ticks enable row level security;

drop policy if exists "Ticks are readable by their owner" on public.audit_action_ticks;
create policy "Ticks are readable by their owner"
  on public.audit_action_ticks for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Ticks are insertable by their owner" on public.audit_action_ticks;
create policy "Ticks are insertable by their owner"
  on public.audit_action_ticks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Ticks are updatable by their owner" on public.audit_action_ticks;
create policy "Ticks are updatable by their owner"
  on public.audit_action_ticks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Ticks are deletable by their owner" on public.audit_action_ticks;
create policy "Ticks are deletable by their owner"
  on public.audit_action_ticks for delete
  to authenticated
  using ((select auth.uid()) = user_id);
