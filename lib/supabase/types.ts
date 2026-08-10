/**
 * Row types for the tables in supabase/migrations/.
 *
 * Hand-written rather than generated, because there are two of them and a
 * generation step is a build dependency this project doesn't otherwise have.
 * If the schema grows past a handful of tables, switch to
 * `supabase gen types typescript` and delete this file — do not maintain both.
 *
 * snake_case here mirrors the database exactly. The app's camelCase types in
 * lib/dashboard/types.ts are a separate thing, and the mapping between them is
 * explicit so a column rename can't silently become an undefined field.
 */

import type { Subscription } from '@/lib/dashboard/types';

export type ProfileRow = {
  id: string;
  name: string | null;
  email: string;
  subscription: Subscription;
  subscription_since: string | null;
  created_at: string;
};

export type SiteRow = {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  industry: string | null;
  location: string | null;
  profile_source: 'schema' | 'inferred' | 'manual' | null;
  get_cited_at: string | null;
  created_at: string;
};

/** Columns a signed-in user is actually granted UPDATE on — see the migration. */
export type SiteWritable = Pick<
  SiteRow,
  'name' | 'domain' | 'industry' | 'location' | 'profile_source'
>;
