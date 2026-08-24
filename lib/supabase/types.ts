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

import type { PlanId } from '@/lib/dashboard/types';

export type ProfileRow = {
  id: string;
  name: string | null;
  email: string;
  /**
   * The account's plan — the only entitlement axis there is.
   *
   * ⚠️ NO UPDATE GRANT FOR `authenticated`, and that is the security property
   * rather than a policy detail. 0001 revoked everything on profiles and
   * granted back `update (name)`; 0002 added `insert (id, email, name)`. This
   * column is outside both lists, so the only writer is the service role — see
   * lib/supabase/admin.ts, which exists for exactly this.
   */
  plan: PlanId;
  /** Anchors the monthly check budget. Null on free. See 0012. */
  plan_since: string | null;
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
  /**
   * ISO 3166-1 alpha-2 the engines are asked from, or null for no location.
   *
   * ⚠️ Reaches ChatGPT and Perplexity only. Gemini rejects a location
   * parameter, so its checks are stored with a null country whatever this says
   * — see the note at the top of lib/tracking/gemini.ts. Customer-settable,
   * unlike brand_name below: this is a statement about their market, not
   * evidence about their results.
   */
  country: string | null;
  /**
   * The business's real name, inferred by the audit — not the display label.
   *
   * `name` is what the customer typed, and most people type their domain. This
   * is what lib/tracking/classify.ts looks for in an answer, so it decides what
   * counts as a mention. Service-role writes only; see 0007.
   */
  brand_name: string | null;
  /**
   * When the weekly automatic check is next due. Null = nothing scheduled.
   *
   * ⚠️ A SPENDING CURSOR, AND SERVICE-ROLE ONLY. 0012 adds no grant for it for
   * the same reason `plan` has none: a browser that could write this could set
   * it to now() on every sweep and bill us for three search-backed engines
   * against 25 questions each time. Set on upgrade, cleared on downgrade, moved
   * forward a week by claim_due_checks().
   */
  next_check_at: string | null;
  created_at: string;
};

/** Columns a signed-in user is actually granted UPDATE on — see the migration. */
export type SiteWritable = Pick<
  SiteRow,
  'name' | 'domain' | 'industry' | 'location' | 'profile_source' | 'country'
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
  /**
   * The full report — pages, findings, pillars.
   *
   * Null on every row written before 0009, which is honest: those reports were
   * only ever in the customer's browser and cannot be recovered. Typed as
   * unknown rather than AuditReport so a stored blob from an older shape has to
   * be parsed rather than trusted.
   */
  report: unknown | null;
  checked_at: string;
};

/**
 * A page of answers — the customer's own content, not evidence.
 *
 * Full CRUD for `authenticated` under RLS, unlike audit_runs and
 * citation_checks. See the reasoning at the top of 0009.
 */
export type FaqGroupRow = {
  id: string;
  site_id: string;
  user_id: string;
  name: string;
  /** Leading slash, no origin. The site row owns the domain. */
  path: string;
  position: number;
  published_at: string | null;
  published_hash: string | null;
  created_at: string;
};

export type FaqRow = {
  id: string;
  /** The group owns the answer; the group knows its site. */
  group_id: string;
  user_id: string;
  question: string;
  answer: string;
  /** Only 'published' reaches the export and the schema markup. */
  status: 'published' | 'draft';
  position: number;
  source: 'generated' | 'manual' | 'discovered';
  tone: string | null;
  language: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A question we watch — the canonical list.
 *
 * ⚠️ `question` must match tracked_prompts.question byte for byte; the two are
 * joined by string equality. Same warning as on that column in 0006.
 */
export type QuestionRow = {
  id: string;
  site_id: string;
  user_id: string;
  question: string;
  why: string | null;
  intent: string | null;
  covered: boolean;
  source: 'discovered' | 'manual';
  added_at: string;
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
  /** Country this check was asked from. Null when no location was sent,
   *  and always null for Gemini, which cannot be targeted. */
  country: string | null;
  checked_at: string;
};

/*
 * TrackingMilestoneRow is gone, with the table it described.
 *
 * 0011 modelled a FINITE schedule — four rows per site on days 7/30/60/90 —
 * because Get Cited bought a fixed number of checks inside a fixed window. A
 * subscription promises a cadence instead, so the schedule became a cursor:
 * sites.next_check_at, moved forward a week by claim_due_checks(). See 0012 for
 * why the objections 0011 raised against a column no longer hold.
 */
