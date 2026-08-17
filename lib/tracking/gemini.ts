import 'server-only';

import {
  classifyStatus,
  cleanSources,
  ENGINE_TIMEOUT_MS,
  failureFromThrow,
  type EngineResult,
} from './types';

/*
  Gemini, via the Gemini API with Google Search grounding.

  ⚠️ THIS IS NOT GOOGLE AI OVERVIEWS. Those appear above search results, have no
  API, and are collected by tools that scrape result pages at scale. Grounded
  Gemini is a different product that can actually be asked — which is why
  ENGINES names it rather than the thing we cannot measure. Reporting a
  permanent zero for AI Overviews would read as "you are never cited there"
  instead of "we never looked".

  ⚠️ Grounding is the expensive part of this engine — Google bills grounded
  queries separately from tokens. It is also the entire point: without it the
  model answers from training data and cites nobody.

  Sources come back as `groundingChunks`, and their `uri` is always a Vertex
  redirector rather than the publisher's own address. Recovering the real host
  from a chunk is the fiddliest part of this file — see resolveHost below, and
  read it before touching anything about sources.

  ⚠️ THIS ENGINE CANNOT BE ASKED FROM A COUNTRY, AND BOTH ROUTES WERE TESTED.

  ChatGPT and Perplexity both take a user location, and it visibly changes what
  they cite. Gemini does not, so a country the customer sets applies to two of
  the three engines and this one must never be labelled with it.

    `userLocation`                        rejected outright — the API answers
                                          400 `Unknown name "userLocation"`.

    `toolConfig.retrievalConfig.latLng`   ACCEPTED, AND DOES NOT LOCALISE. This
                                          is the trap: London and New York
                                          coordinates return different sources,
                                          which reads as working. It is run-to-
                                          run variance. Asked "how much does it
                                          cost to replace a roof?" from London
                                          it returned thisoldhouse.com, angi.com
                                          and gaf.com — not one .uk host, on a
                                          question a genuinely UK search fills
                                          with them.

  So: do not add a location here on the strength of the documentation. If it
  ever becomes supported, prove it with a country-revealing question and check
  the SOURCES change nationality, not merely that they change.
*/

/**
 * Small and search-backed: we want the retrieval, not the reasoning.
 *
 * ⚠️ THIS PIN GOES STALE AND FAILS LOUDLY WHEN IT DOES. Google retires a model
 * for *new* keys before old ones, so a version that works on an existing key
 * answers `404 — "no longer available to new users"` on a freshly minted one.
 * That is exactly how `gemini-2.5-flash` died here. A 404 from this endpoint
 * means bump this constant, not that the key is wrong — check with an
 * ungrounded call, which isolates the model from the grounding quota below.
 *
 * ⚠️ A 429 is the other thing entirely: Google Search grounding has zero quota
 * on the free tier, so every model 200s ungrounded and 429s the moment the
 * tool is attached. That is a billing setting, not a model choice.
 */
const MODEL = 'gemini-3.7-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type GroundingChunk = { web?: { uri?: string; domain?: string; title?: string } };

/**
 * A bare hostname and nothing else — no scheme, no path, no spaces.
 *
 * The gate on `title` in resolveHost. Requires at least one dot and rejects
 * anything shaped like prose, which is what tells a host apart from an actual
 * page title.
 */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * The publisher's own address for one grounding chunk, or null.
 *
 * ⚠️ RETURNING THE REDIRECTOR IS WORSE THAN RETURNING NOTHING, which is the
 * whole reason this function exists. `vertexaisearch.cloud.google.com/...` is a
 * real URL, so cleanSources() keeps it and classify.ts then does two wrong
 * things with it: our customer's domain can never match it, so a genuine
 * citation reads as `absent`; and citedInstead() takes the first source that
 * isn't ours, so the dashboard names Google as the competitor who beat them.
 * Both are invented figures wearing the costume of a measurement. Dropping the
 * chunk costs one source; keeping it costs the number its meaning.
 *
 * ⚠️ `title` HOLDING A HOSTNAME IS OBSERVED, NOT PROMISED. Google returned
 * `domain` until 2.5 and stopped; 3.7 sends the host in `title` instead
 * (measured: 32/32 chunks across four queries, on both v1beta and v1). Nothing
 * documents that, and a field called `title` may well hold a title again one
 * day — hence the regex rather than blind trust. If Gemini ever starts
 * reporting zero sources on answers that plainly cite someone, suspect this
 * first and log a raw chunk.
 */
function resolveHost(chunk: GroundingChunk): string | null {
  const web = chunk.web;
  if (!web) return null;

  // Still first: older models send it, and it is the unambiguous one.
  if (web.domain) return `https://${web.domain}`;

  if (web.title && HOSTNAME.test(web.title)) return `https://${web.title}`;

  // A uri that isn't a redirector is the publisher's own, so it is usable.
  if (web.uri && !web.uri.includes('vertexaisearch')) return web.uri;

  return null;
}

export async function askGemini(question: string): Promise<EngineResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('your-')) {
    return {
      ok: false,
      failure: {
        engine: 'Gemini',
        reason: 'not-configured',
        detail: 'GEMINI_API_KEY is not set.',
      },
    };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        failure: {
          engine: 'Gemini',
          reason: classifyStatus(res.status),
          detail: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        },
      };
    }

    const data = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        groundingMetadata?: { groundingChunks?: GroundingChunk[] };
      }[];
    };

    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    // Chunks we cannot resolve to a publisher host are dropped rather than
    // passed on as redirectors — see resolveHost for why that trade is the
    // right way round.
    const urls = (candidate?.groundingMetadata?.groundingChunks ?? [])
      .map(resolveHost)
      .filter((url): url is string => url !== null);

    return {
      ok: true,
      answer: { engine: 'Gemini', text, sources: cleanSources(urls) },
    };
  } catch (err) {
    return failureFromThrow('Gemini', err);
  }
}
