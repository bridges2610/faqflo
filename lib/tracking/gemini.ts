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

  Sources come back as `groundingChunks`, and their `uri` is usually a Vertex
  redirector rather than the publisher's own address.
*/

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type GroundingChunk = { web?: { uri?: string; domain?: string } };

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

    /*
      Prefer `domain` over `uri`.

      The uri is typically a vertexaisearch.cloud.google.com redirect, which is
      a real URL and would pass cleanSources() — and then match nobody's domain,
      recording every customer as uncited. `domain` is the publisher's actual
      host, so it is promoted to a URL when present and the redirector is only
      the fallback.
    */
    const urls = (candidate?.groundingMetadata?.groundingChunks ?? []).map((chunk) =>
      chunk.web?.domain ? `https://${chunk.web.domain}` : chunk.web?.uri,
    );

    return {
      ok: true,
      answer: { engine: 'Gemini', text, sources: cleanSources(urls) },
    };
  } catch (err) {
    return failureFromThrow('Gemini', err);
  }
}
