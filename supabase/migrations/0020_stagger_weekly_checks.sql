-- Spread the weekly citation checks across the week.
--
-- Apply via the Supabase SQL editor, after 0001-0019.
--
-- ⚠️ RE-RUNNABLE, AND STABLE. The offset comes from the site id, so running this
-- twice lands every site on the same day it landed on the first time.


/* ------------------------------------------------- one check day per site --- */

-- ⚠️ EVERY EXISTING PRO SITE HAS BEEN FIRING ON THE SAME NIGHT.
--
-- 0012 backfilled `next_check_at = now()` for every Pro site that existed then,
-- and claim_due_checks() advances the cursor by exactly seven days FROM THE DUE
-- DATE to hold a stable weekday. A stable weekday is the right behaviour for one
-- customer and the wrong one for all of them at once: that whole cohort has been
-- claimed in a single sweep ever since, and would have kept doing so forever.
--
-- Sites added since are staggered by whichever day their owner subscribed, which
-- is better but still clusters — a launch day, or a busy Monday, puts everyone
-- who signed up on it onto the same night permanently.
--
-- The first byte of md5(id) gives each site a fixed 0-6 day offset instead.
--
-- ⚠️ get_byte, NOT A CAST TO int. The obvious spelling —
-- ('x' || substr(md5(id), 1, 8))::bit(32)::bigint % 7 — reads the hex as a
-- SIGNED 32-bit integer, so roughly half of all ids come out negative and the
-- modulo with them: a negative offset is a check date in the PAST, which the
-- sweep would claim immediately. A byte is 0-255 and cannot do that.
--
-- ⚠️ THIS ARITHMETIC IS MIRRORED IN staggerOffsetDays() in
-- lib/tracking/schedule.ts, which places sites created from now on. Keep the two
-- identical or a site gets one day from the backfill and a different one from
-- the code.
update public.sites s
   set next_check_at = date_trunc('day', now())
                     + interval '1 day'
                     + (get_byte(decode(md5(s.id::text), 'hex'), 0) % 7) * interval '1 day'
  from public.profiles p
 where p.id = s.user_id
   and p.plan = 'pro'
   and s.next_check_at is not null;

-- Free accounts are untouched on purpose: next_check_at is null for them, the
-- WHERE above skips nulls, and claim_due_checks() requires plan = 'pro' anyway.
-- Free buys three runs it starts itself, not a cadence.
