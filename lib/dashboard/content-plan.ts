import type { ContentPlan, Site } from './types';
import type { MustHavePage, ArticleTopic } from './types';

/**
 * Asking for a content plan, from the browser.
 *
 * ⚠️ EXTRACTED SO THERE IS ONE CALLER, NOT TWO. This lived inline in
 * content-workspace.tsx and was about to be copied into write-panel.tsx when the
 * topic list started using the plan's suggestions. Two copies of a
 * prompt-shaped request drift: one gains the profile write-back, the other
 * doesn't, and the two screens quietly disagree about what a plan is.
 *
 * The sibling of lib/dashboard/discover.ts, which exists for exactly this
 * reason and has the same shape — a discriminated result rather than a throw,
 * so a caller can render the refusal it was given instead of a generic one.
 */

type Generated = {
  profile: { industry: string; location: string };
  mustHave: MustHavePage[];
  topics: ArticleTopic[];
};

export type ContentPlanResult =
  | {
      ok: true;
      plan: ContentPlan;
      /**
       * What to write back onto the site row, or null when nothing should be.
       *
       * ⚠️ THE CALLER APPLIES THIS, AND THE RULE COMES WITH IT: never over a
       * manual profile. The customer correcting us is the most reliable signal
       * we have, and a later generation quietly reverting it would be the
       * feature arguing with its user. Returned rather than applied here
       * because renameSite is a store call and this file makes no writes.
       */
      profile: { industry: string; location: string | null; profileSource: 'schema' | 'inferred' } | null;
    }
  | { ok: false; error: string };

export async function generateContentPlan(site: Site): Promise<ContentPlanResult> {
  const pages = site.lastAudit?.pages ?? [];

  /*
    Checked here as well as in the route, for the reason discover.ts gives about
    its own guard: the route's message is the honest one, but firing a request
    we know will be rejected spends a round trip to say something we already
    knew before anyone pressed anything.
  */
  if (pages.length === 0) {
    return {
      ok: false,
      error: 'Run a full check of your site first — we read your own pages to work these out.',
    };
  }

  /*
    Precedence: what a person told us, then what the site's own markup says,
    then nothing — in which case the model infers from the home page.

    The middle step matters. A site publishing LocalBusiness markup has already
    stated its trade and service area; asking a model to guess at what it has
    been told outright is both slower and worse.
  */
  const fromSchema = site.lastAudit?.profile;
  const knownIndustry = site.industry ?? fromSchema?.industry ?? null;
  const knownLocation = site.location ?? fromSchema?.location ?? null;

  try {
    const res = await fetch('/api/dashboard/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The site id, not the domain — the server reads the domain off the row
      // it owns rather than off whatever a caller names.
      body: JSON.stringify({
        siteId: site.id,
        industry: knownIndustry,
        location: knownLocation,
        hint: site.lastAudit?.profileHint ?? '',
        pages,
      }),
    });

    const data = (await res.json()) as Partial<Generated> & { error?: string };
    if (!res.ok || !data.mustHave || !data.topics || !data.profile) {
      return { ok: false, error: data.error ?? 'That plan failed. Please try again.' };
    }

    return {
      ok: true,
      plan: {
        siteId: site.id,
        industry: data.profile.industry,
        location: data.profile.location || null,
        mustHave: data.mustHave,
        topics: data.topics,
        generatedAt: new Date().toISOString(),
      },
      profile:
        site.profileSource !== 'manual' && data.profile.industry
          ? {
              industry: data.profile.industry,
              location: data.profile.location || null,
              // Only "schema" when the markup supplied both — a half-read
              // profile that the model completed is an inference, and the badge
              // that says "check this" should appear.
              profileSource: knownIndustry && knownLocation ? 'schema' : 'inferred',
            }
          : null,
    };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}
