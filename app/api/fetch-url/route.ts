import { NextResponse } from 'next/server';
import { safeFetch, type FetchFailure } from '@/lib/audit/safe-fetch';
import { checkPublicHttpUrl } from '@/lib/audit/url-guard';
import { currentUser } from '@/lib/auth/dal';
import { MAX_CONTENT_CHARS } from '@/lib/faq';
import {
  checkRateLimit,
  FETCH_URL_ANON_RATE_LIMIT,
  FETCH_URL_RATE_LIMIT,
  limitKey,
} from '@/lib/rate-limit';

/*
  Fetch a page and hand back its readable text, for the FAQ generator.

  ⚠️ THIS ROUTE IS ANONYMOUS NOW, AND IT USED TO SAY THE OPPOSITE HERE. The old
  comment read "It is a dashboard tool, so it wants a session anyway" — which
  stopped being true the moment the generator on the marketing home page grew a
  "Use a URL" mode. That mode posts here, no visitor to a marketing page is
  signed in, and so the feature answered "Sign in to read a page." every single
  time it was used.

  What a session still decides is the ceiling, not the answer: signed-in
  callers get FETCH_URL_RATE_LIMIT against their account, anonymous ones get
  the much lower FETCH_URL_ANON_RATE_LIMIT against their IP. Same split, and
  the same limitKey() call, as app/api/audit/route.ts — the other route that
  serves the marketing page and the dashboard from one handler.

  ⚠️ WHAT ACTUALLY PROTECTS THIS IS NOT THE LIMITER. It fetches an address a
  stranger typed, from our server, inside our network. Two things stand in the
  way and both live elsewhere on purpose, shared with the audit crawler:

    lib/audit/url-guard.ts    refuses private ranges, loopback, cloud metadata
                              and non-http schemes.
    lib/audit/safe-fetch.ts   re-checks every redirect hop against that guard,
                              and caps the response body.

  The limiter is a cost control on top. Read the header of safe-fetch.ts before
  changing anything about how the request is made.
*/

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Strip a page down to readable text. Carried over from the Express version.
 *
 * Regex tag-stripping is crude, but it's dependency-free and the output only
 * ever feeds a prompt — it doesn't need to be a faithful DOM parse, and nothing
 * is rendered as HTML downstream.
 */
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

/**
 * A failure kind, as something worth showing a stranger.
 *
 * ⚠️ IT USED TO RETURN THE RAW ERROR: `Failed to fetch that URL: ${err.message}`
 * put Node's connection text in front of an anonymous caller — "ECONNREFUSED
 * 10.0.0.5:80", "EAI_AGAIN internal.corp". That is an SSRF oracle: the guard
 * refuses to fetch the private network, and the error message then reports
 * what is listening on it anyway. Fixed strings only, and never the address.
 *
 * Same shape and the same reasoning as describe() in app/api/audit/route.ts.
 */
function describe(failure: FetchFailure): { message: string; status: number } {
  switch (failure.kind) {
    case 'timeout':
      return { message: 'That page took too long to respond.', status: 504 };
    case 'notfound':
      return { message: "There's no page at that address.", status: 400 };
    case 'blocked':
      return {
        message: 'That site refused to let us read the page. Try pasting the content instead.',
        status: 502,
      };
    case 'server':
      return { message: 'That site returned an error when we asked for the page.', status: 502 };
    case 'empty':
      return { message: 'That page came back empty.', status: 400 };
    case 'unreachable':
      // Also the answer for a redirect into a private range. Deliberately says
      // nothing about where it was pointed.
      return { message: "We couldn't reach that page.", status: 400 };
  }
}

export async function POST(request: Request) {
  // May be null, and that is not an error — it only chooses the ceiling.
  const user = await currentUser();
  const limit = user ? FETCH_URL_RATE_LIMIT : FETCH_URL_ANON_RATE_LIMIT;

  if (!checkRateLimit(`fetch-url:${limitKey(user?.id ?? null, request.headers)}`, limit)) {
    return fail("That's the page reads for today. They reset at midnight UTC.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const { url } = (body ?? {}) as Record<string, unknown>;
  if (typeof url !== 'string' || !url.trim()) return fail('URL is required.');

  /*
    Vetted here as well as inside safeFetch, and that repetition is on purpose:
    this pass is what produces a useful message for the person typing. A bad
    scheme or a private address gets url-guard's own wording ("Only http and
    https addresses can be checked"), where safeFetch would flatten it to
    "unreachable" — correct for a redirect target somebody else chose, useless
    for the address a visitor just typed.
  */
  const checked = checkPublicHttpUrl(url);
  if (!checked.ok) return fail(checked.reason);

  const result = await safeFetch(checked.url.toString(), 'FaqFlo/2.0 (+https://faqflo.com)');

  if (!result.ok) {
    const { message, status } = describe(result.failure);
    return fail(message, status);
  }

  const contentType = result.contentType ?? '';
  if (!contentType.includes('html') && !contentType.includes('text')) {
    return fail('That URL does not look like a web page.');
  }

  const text = extractText(result.body);
  if (text.length < 50) {
    return fail("We couldn't pull enough text from that page. Try pasting the content instead.");
  }

  return NextResponse.json({ content: text });
}
