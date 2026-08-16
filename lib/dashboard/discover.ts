/**
 * Asking the model for questions — the one definition of that request.
 *
 * Two screens now start a discovery run: Opportunities, where it REPLACES the
 * list, and Results, where it APPENDS to it. Both send the same body, and the
 * body is not obvious — `pages` is required or the route 400s, and `answered`
 * is what stops the model proposing things the customer already covers.
 *
 * ⚠️ ONE COPY, ON PURPOSE. Two inline fetches would drift, and the way they
 * would drift is silent: a caller that stops sending `answered` still gets a
 * perfectly good-looking list, just one that re-proposes work already done, and
 * nothing fails. Same reasoning as sourceHost living in ./domain.
 *
 * Client-only — it is a fetch to our own route, called from event handlers.
 */

import type { GeneratedQuestion } from '@/lib/questions';
import type { FaqEntry, Site } from './types';

export type DiscoverResult =
  | { ok: true; questions: GeneratedQuestion[] }
  | { ok: false; error: string };

/**
 * @param exclude Questions the model must not propose again, beyond the ones
 *   the site already publishes. Passing the current watch list is what makes a
 *   second run return something new rather than a reworded first run.
 */
export async function discoverQuestions({
  site,
  faqs,
  exclude = [],
}: {
  site: Site;
  faqs: FaqEntry[];
  exclude?: string[];
}): Promise<DiscoverResult> {
  const pages = site.lastAudit?.pages ?? [];

  /*
    Checked here as well as in the route. The route's message is the honest one
    ("Run a full check of your site first"), but firing a request we know will
    be rejected spends a round trip to tell the customer something we already
    knew before they pressed anything.
  */
  if (pages.length === 0) {
    return { ok: false, error: 'Run a full check of your site first — there are no pages to read.' };
  }

  try {
    const res = await fetch('/api/dashboard/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: site.id,
        industry: site.industry,
        location: site.location,
        hint: site.lastAudit?.profileHint ?? '',
        pages,
        // Sent so the model doesn't propose things already answered — the
        // fastest way to look like we never read their site. The route caps
        // this list, so order matters: what we already watch comes first,
        // because re-proposing a tracked question is the more visible failure.
        answered: [
          ...exclude,
          ...faqs.filter((f) => f.status === 'published' && f.answer.trim()).map((f) => f.question),
        ],
      }),
    });

    const payload = (await res.json()) as { questions?: GeneratedQuestion[]; error?: string };

    if (!res.ok || !payload.questions) {
      return { ok: false, error: payload.error ?? 'Could not find questions. Please try again.' };
    }

    return { ok: true, questions: payload.questions };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}
