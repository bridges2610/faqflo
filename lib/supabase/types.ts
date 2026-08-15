/**
 * Row types for the tables in supabase/migrations/.
 *
 * Hand-written rather than generated, because a generation step is a build
 * dependency this project doesn't otherwise have.
 *
 * ⚠️ THE SCHEMA HAS NOW REACHED THE LINE THIS COMMENT DRAWS. Citation tracking
 * (0006) took it to seven tables, and "a handful" was the stated threshold for
 * switching to `supabase gen types typescript` and deleting this file. The next
 * table is a good moment to do it — hand-maintained row types drift, and this
 * file already has: ProfileRow is missing `welcomed_at`, which 0004 added.
 * Do not maintain both.
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

/**
 * One completed audit, kept so a score can become a trend.
 *
 * SELECT-only for `authenticated` — rows are written by the service role from
 * app/api/audit/route.ts. See supabase/migrations/0005_audit_runs.sql.
 */
export type AuditRunRow = {
  id: string;
  site_id: string;
  user_id: string;
  score: number;
  scored_count: number;
  /** Quick and full runs are not comparable — never plot them on one line. */
  depth: 'quick' | 'full';
  pillar_scores: Record<string, number>;
  checked_at: string;
};

/**
 * A question we watch for a site — the input side of citation tracking.
 *
 * ⚠️ `question` must match DiscoveredQuestion.question byte for byte; the
 * dashboard joins them by string equality to close the answer loop. See the
 * comment on the column in supabase/migrations/0006_citation_tracking.sql.
 *
 * SELECT-only for `authenticated`, written by the service role.
 */
export type TrackedPromptRow = {
  id: string;
  site_id: string;
  user_id: string;
  question: string;
  created_at: string;
};

/**
 * One question put to one engine on one run — the output side.
 *
 * SELECT-only for `authenticated`. This table is the product's evidence, so a
 * browser that could write it could write its own citation history and feed it
 * into the audit score. Rows come from the service role in
 * app/api/dashboard/tracking/route.ts. See 0006_citation_tracking.sql.
 */
export type CitationCheckRow = {
  id: string;
  site_id: string;
  user_id: string;
  question: string;
  /** Kept in step with ENGINES in lib/dashboard/types.ts by a CHECK constraint. */
  engine: string;
  outcome: 'cited' | 'mentioned' | 'absent';
  cited_instead: string | null;
  /** The answer's source URLs, as returned. Why a row says what it says. */
  sources: string[];
  answer_excerpt: string | null;
  checked_at: string;
};
