/* ---------------------------------------------------- welcome email state ---

  One column, and its whole job is making sure a welcome email is sent exactly
  once per account.

  Not derivable from what already exists. `profiles.created_at` is close but
  wrong: the row is created by the signup trigger, before the account has been
  confirmed or used, and an email sign-up may sit unconfirmed for days. What we
  want to mark is the first time somebody actually got IN — which is
  /auth/callback, the one place Google, email confirmation and password
  recovery all converge.

  The send is claimed rather than checked:

    update public.profiles set welcomed_at = now()
     where id = $1 and welcomed_at is null
    returning email, name;

  A returned row means this call won and owns the send. No row means somebody
  else already did it. That is the same shape as claimEvent() in
  lib/stripe/fulfil.ts, and for the same reason — select-then-write loses to
  concurrency, only the write can arbitrate.

  ⚠️ NO GRANT NEEDED, AND NO REVOKE EITHER.

  0001 grants column privileges as an ALLOW-LIST — `grant update (name) on
  public.profiles to authenticated` and nothing else. A new column is therefore
  already unwritable by a signed-in user, which is what we want: a browser that
  could null this could make us re-send mail on demand. The verification query
  at the bottom asserts that rather than trusting it.
*/

alter table public.profiles
  add column if not exists welcomed_at timestamptz;

comment on column public.profiles.welcomed_at is
  'When the welcome email was claimed. Set once by /auth/callback; service-role only.';

/* ------------------------------------------------------------ verify ------ */

-- Expect: welcomed_at = false, name = true.
-- If welcomed_at comes back true, the allow-list has been widened somewhere
-- and a browser can trigger email. Fix that before deploying.
do $$
declare
  can_write boolean;
begin
  select has_column_privilege('authenticated', 'public.profiles', 'welcomed_at', 'UPDATE')
    into can_write;

  if can_write then
    raise exception
      'authenticated can UPDATE profiles.welcomed_at — it must not. Check the grants in 0001.';
  end if;

  raise notice 'ok: welcomed_at is not writable by authenticated';
end $$;
