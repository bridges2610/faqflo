import { checkPublicHttpUrl } from './url-guard';

/**
 * The one place this app reaches out to an address a stranger typed.
 *
 * Everything that fetches user-supplied URLs goes through here: the audit
 * crawler (lib/audit/fetcher.ts) and the page reader behind the FAQ generator
 * (app/api/fetch-url/route.ts). Both are reachable without an account, so the
 * request leaves our server, from our network, on behalf of someone we know
 * nothing about.
 *
 * checkPublicHttpUrl in ./url-guard.ts decides whether an address is allowed.
 * This module is about everything that happens *after* that decision, and it
 * exists because two of those things were getting the guard wrong:
 *
 *   ⚠️ REDIRECTS USED TO BE FOLLOWED BLIND. Both callers passed
 *      `redirect: 'follow'`, which hands the whole chain to the platform —
 *      and the platform has never heard of our guard. The guard ran once, on
 *      the address the user typed, and a 302 from there went anywhere it
 *      liked. `https://attacker.example/x` redirecting to
 *      `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
 *      fetched cloud metadata and handed back the body. Every private-range
 *      check in url-guard.ts was one redirect away from irrelevant.
 *
 *      So: `redirect: 'manual'`, and every hop is re-checked before it is
 *      followed. The information was always there — `res.url` already
 *      exposed the final address — it was simply never looked at.
 *
 *   ⚠️ THE BODY USED TO BE UNBOUNDED. `await res.text()` buffers whatever
 *      arrives, with no content-length check and no counter. A multi-gigabyte
 *      file served as text/plain takes the function down, and the 10s timeout
 *      is no defence at all on a fast link. The body is now read through a
 *      counter and cut off at MAX_BYTES.
 *
 * ⚠️ WHAT THIS STILL DOES NOT DO — stated plainly, the way url-guard.ts states
 * its own limits. There is no DNS resolution before connect, so a hostname
 * whose A record points into a private range (DNS rebinding) still gets
 * through: we check the name, the resolver picks the address, and nothing
 * compares the two. Closing that needs resolve-then-connect, which the
 * platform `fetch` does not expose — it belongs at the network layer. What is
 * here removes everything that is trivially exploitable from a browser.
 */

/** Enough HTML for any real page, small enough that it cannot exhaust memory. */
const MAX_BYTES = 2 * 1024 * 1024;

const TIMEOUT_MS = 10_000;

/**
 * Redirect hops followed before giving up.
 *
 * Five is what browsers and curl settle on. It is generous for the
 * http→https→www→/path chain a real site produces, and short enough that a
 * redirect loop costs five requests rather than a timeout's worth.
 */
const MAX_HOPS = 5;

/**
 * Why we couldn't read a page.
 *
 * ⚠️ MOVED HERE FROM ./fetcher.ts, WHICH RE-EXPORTS IT. It has to live beside
 * the function that produces it, and fetcher.ts now imports that function —
 * leaving the type there would have made the two modules import each other.
 *
 * It exists because "we got nothing back" is not one thing, and the audit was
 * reporting it as one: a firewall turning us away and a mistyped address
 * produced the same sentence, and only one of them is the user's fault.
 */
export type FetchFailure =
  | { kind: 'blocked'; status: number }
  | { kind: 'notfound'; status: number }
  | { kind: 'server'; status: number }
  | { kind: 'timeout' }
  | { kind: 'unreachable' }
  | { kind: 'empty' };

export type FetchResult =
  | {
      ok: true;
      status: number;
      finalUrl: string;
      body: string;
      ms: number;
      /**
       * The response's Content-Type, or null when it sent none.
       *
       * Surfaced because the page reader has to refuse a PDF or an image that
       * happens to answer 200, and it previously read the header off the
       * Response itself — which it no longer holds now that reading the body
       * happens in here.
       */
      contentType: string | null;
    }
  | { ok: false; failure: FetchFailure };

export function classify(status: number): FetchFailure {
  if (status === 404 || status === 410) return { kind: 'notfound', status };
  if (status >= 500) return { kind: 'server', status };
  // 401/403/429/451 say so outright; anything else non-2xx that isn't a
  // redirect (those are handled by hand below) is a refusal in practice.
  return { kind: 'blocked', status };
}

/** 308 and 307 preserve the method; the older three are treated as GET anyway. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Read a response body, stopping at `MAX_BYTES`.
 *
 * Truncating rather than failing is deliberate: a page that runs long is still
 * worth auditing, and the callers already cut the text down further — the
 * generator to MAX_CONTENT_CHARS, the audit to whatever its parser keeps. The
 * cap is here to bound memory, not to judge the page.
 */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  // No stream to read (HEAD, 204, or a runtime that didn't give us one).
  if (!body) return (await res.text()).slice(0, MAX_BYTES);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_BYTES) break;
    }
  } finally {
    // Tells the far end we are done, so a huge file stops arriving rather than
    // continuing to stream into a socket nobody is reading.
    await reader.cancel().catch(() => {});
  }

  const joined = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }

  // fatal: false so a multi-byte character cut in half by the cap degrades to
  // a replacement character instead of throwing away the whole page.
  return new TextDecoder('utf-8', { fatal: false }).decode(joined.subarray(0, MAX_BYTES));
}

/**
 * Fetch one URL, following redirects only to addresses that pass the guard.
 *
 * @param url        Raw user input. Vetted here, so callers need not pre-check.
 * @param userAgent  Who we say we are. The audit and the page reader identify
 *                   differently, and both identify honestly — see the note on
 *                   UA in fetcher.ts about masquerading costing us pages.
 */
export async function safeFetch(url: string, userAgent: string): Promise<FetchResult> {
  const started = Date.now();

  let target: string = url;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const guard = checkPublicHttpUrl(target);
    /*
      ⚠️ THIS RUNS ON EVERY HOP, NOT JUST THE FIRST. The first pass vets what
      the user typed; every pass after it vets where somebody else's server is
      trying to send us, which is the case that actually matters.

      A blocked redirect reports `unreachable` rather than naming the address.
      Telling an anonymous caller "that redirected to 10.0.0.5" would turn a
      refusal into a network-mapping tool.
    */
    if (!guard.ok) return { ok: false, failure: { kind: 'unreachable' } };

    let res: Response;
    try {
      res = await fetch(guard.url.toString(), {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'manual',
      });
    } catch (err) {
      // A timeout and a dead host both throw here, and they mean different
      // things to the person who typed the address.
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      return { ok: false, failure: { kind: timedOut ? 'timeout' : 'unreachable' } };
    }

    if (REDIRECT_STATUSES.has(res.status)) {
      const location = res.headers.get('location');
      // A redirect with nowhere to go is a broken response, not a refusal.
      if (!location) return { ok: false, failure: { kind: 'unreachable' } };

      // Resolved against the current URL: Location is very often relative
      // ("/en/", "../"), and feeding that to the guard as-is would fail.
      try {
        target = new URL(location, guard.url).toString();
      } catch {
        return { ok: false, failure: { kind: 'unreachable' } };
      }
      continue;
    }

    if (!res.ok) return { ok: false, failure: classify(res.status) };

    return {
      ok: true,
      status: res.status,
      finalUrl: guard.url.toString(),
      body: await readCapped(res),
      ms: Date.now() - started,
      contentType: res.headers.get('content-type'),
    };
  }

  // Ran out of hops — a redirect loop, or a chain longer than any real site's.
  return { ok: false, failure: { kind: 'unreachable' } };
}
