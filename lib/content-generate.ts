import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import type { PageContent } from '@/lib/audit/types';
import {
  buildContentPrompt,
  CONTENT_SCHEMA,
  TOPIC_COUNT,
  type ContentGeneration,
} from '@/lib/content';

/*
  The model call behind the content plan, lifted out of its route.

  ⚠️ WHY THIS IS ITS OWN MODULE — THE SAME REASON lib/questions-generate.ts IS,
  and that file's note is worth reading alongside this one. The onboarding scan
  now builds a topic list from app/api/scan/tick/route.ts, with no request to
  read a body from and no browser to send one. Leaving the call inside the route
  handler would have meant the runner POSTing to our own endpoint with a forged
  session, or a second copy of the prompt, the model choice, the caps and the
  error taxonomy — and two copies drift. The route keeps auth, entitlement and
  rate limiting, which are about the caller; this holds everything about the
  request, which is not.

  ⚠️ NOT in lib/content.ts. That file exports matchMustHave() and is imported by
  components/dashboard/content-workspace.tsx, which is client code — putting the
  Anthropic SDK in it would pull the whole SDK into the browser bundle.
  `server-only` above makes that a build error rather than a surprise in a
  network tab.
*/

/*
  Not claude-haiku-4-5, which the two FAQ routes use.

  Their choice is right for what they do — turning supplied text into questions
  and answers is transcription, and Haiku is fast and cheap at it. This is a
  different job: read a company's home page, work out what trade it is in and
  where it operates, then reason about what pages that trade needs and what its
  customers would actually search for. That is judgment, and it is the whole
  value of the feature.
*/
const MODEL = 'claude-opus-5';

/*
  Larger than the 8192 the FAQ routes use, for a reason specific to this model:
  thinking is on by default on Claude Opus 5, and max_tokens caps thinking AND
  response text together. At 8192 a plan that reasons carefully about a hundred
  pages can run out of budget mid-answer. 16000 also keeps a non-streaming
  request inside the SDK's HTTP timeout.
*/
const MAX_TOKENS = 16_000;

/** Guard against a caller pasting an entire crawl of somebody else's site. */
export const MAX_PAGES = 120;

/** Trusted only for shape — this may have come from a client, and clients lie. */
export function isPageContent(value: unknown): value is PageContent {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<PageContent>;
  return typeof p.url === 'string' && typeof p.title === 'string' && Array.isArray(p.headings);
}

/**
 * Discriminated rather than thrown, for the reason questions-generate.ts gives:
 * the `status` has to survive as far as the route (which turns it into an HTTP
 * code) and the scan runner (which decides whether a retry is worth paying for).
 */
export type BuildContentPlanResult =
  | { ok: true; plan: ContentGeneration }
  | { ok: false; error: string; status: number };

export type BuildContentPlanInput = {
  domain: string;
  industry: string | null;
  location: string | null;
  hint?: string;
  pages: PageContent[];
};

/**
 * Ask Claude what pages this industry expects and what is worth writing.
 *
 * Callers own auth, entitlements and rate limiting. This owns the prompt, the
 * model, the caps and the error taxonomy.
 *
 * ⚠️ `buildContentPlan`, NOT `generateContentPlan`, AND THE NAME IS DELIBERATE.
 * lib/dashboard/content-plan.ts already exports a `generateContentPlan` — the
 * CLIENT wrapper that fetches /api/dashboard/content from the browser. Two
 * functions with one name, one of which pulls the Anthropic SDK into whatever
 * imports it, is an import somebody gets wrong exactly once and expensively.
 * The verb matches buildContentPrompt, which this is the other half of.
 */
export async function buildContentPlan(
  input: BuildContentPlanInput,
): Promise<BuildContentPlanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not configured.', status: 500 };
  }

  const clean = input.pages.filter(isPageContent).slice(0, MAX_PAGES);
  if (clean.length === 0) {
    return {
      ok: false,
      error: 'Run a full audit first — there are no pages to plan from.',
      status: 400,
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: {
        // Medium rather than the default high: the reasoning here is wide (a
        // hundred pages) but not deep, and high spends thinking tokens on a
        // problem that does not get more correct for having them.
        effort: 'medium',
        format: { type: 'json_schema', schema: CONTENT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: buildContentPrompt({
            domain: input.domain,
            industry: input.industry?.trim() || null,
            location: input.location?.trim() || null,
            hint: input.hint ?? '',
            pages: clean,
          }),
        },
      ],
    });

    // Checked before the content is read: on a refusal there is nothing in it.
    if (message.stop_reason === 'refusal') {
      return { ok: false, error: 'Claude declined to build a plan for that site.', status: 400 };
    }
    if (message.stop_reason === 'max_tokens') {
      return {
        ok: false,
        error: 'The plan came back too long to finish. Please try again.',
        status: 500,
      };
    }

    const text = message.content.find((block) => block.type === 'text')?.text;
    if (!text) return { ok: false, error: 'No plan came back. Please try again.', status: 500 };

    const plan = JSON.parse(text) as ContentGeneration;
    if (!Array.isArray(plan.mustHave) || !Array.isArray(plan.topics) || !plan.topics.length) {
      return { ok: false, error: 'No plan came back. Please try again.', status: 500 };
    }

    /*
      ⚠️ "THE PAGES YOUR INDUSTRY EXPECTS" IS DROPPED WHEN WE ONLY READ ONE PAGE,
      AND IT IS DROPPED HERE SO IT IS DROPPED FOR EVERY CALLER.

      That half is a comparison: matchMustHave() in lib/content.ts decides a page
      is missing by failing to find it among the pages we crawled. On a one-page
      crawl — which is exactly what PAGE_BUDGET.free is — it would report a
      services page, a pricing page and an about page all "absent" from a site
      that may well have every one of them. The model is not wrong about what the
      trade needs; we simply did not look, and "did not look" rendered as "you
      are missing" is a finding we never measured.

      This codebase already refuses that trade everywhere it comes up:
      score.ts leaves unmeasured checks out of the denominator rather than
      scoring them, and lib/questions.ts tells the model not to invent ask
      volumes. Same rule, applied to the one place it can be enforced for both
      the route and the onboarding scan at once.

      ⚠️ TESTED ON THE CRAWL, NOT ON THE PLAN. A Pro site that genuinely has one
      page is in exactly the same evidential position as a free one and gets the
      same silence. Where there IS a real crawl behind it the half is kept, so a
      Pro scan produces the whole plan in one call.

      The topics half survives either way: it is written FROM the home page and
      the trade, not from an inventory of what is absent.
    */
    const mustHave = clean.length <= 1 ? [] : plan.mustHave;

    return {
      ok: true,
      plan: { ...plan, mustHave, topics: plan.topics.slice(0, TOPIC_COUNT) },
    };
  } catch (err) {
    // Same taxonomy as the other routes — APIConnectionError extends APIError in
    // the TS SDK, so it has to be tested first.
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'The configured API key was rejected.', status: 500 };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        error: "We're getting a lot of requests right now. Try again in a moment.",
        status: 429,
      };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return {
        ok: false,
        error: "Couldn't reach Claude. Check your connection and try again.",
        status: 502,
      };
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error:', err.status, err.message);
      return { ok: false, error: 'Claude returned an error. Please try again.', status: 502 };
    }
    console.error('Unexpected content plan error:', err);
    return { ok: false, error: 'Something went wrong. Please try again.', status: 500 };
  }
}
