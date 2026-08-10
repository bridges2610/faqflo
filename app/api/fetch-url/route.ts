import { NextResponse } from 'next/server';
import { checkPublicHttpUrl } from '@/lib/audit/url-guard';
import { currentUser } from '@/lib/auth/dal';
import { MAX_CONTENT_CHARS } from '@/lib/faq';
import { checkRateLimit, FETCH_URL_RATE_LIMIT, limitKey } from '@/lib/rate-limit';

/*
  Fetch a page and hand back its readable text, for the dashboard generator.

  ⚠️ This route previously had NO rate limit and NO authentication — it did not
  import the limiter at all. That made it a general-purpose fetch proxy anyone
  could point at any public address, from our servers and our IP: an
  unmetered way to make somebody else's traffic look like ours. The SSRF guard
  stopped it reaching private networks, which is a different problem.

  Both are fixed here. It is a dashboard tool, so it wants a session anyway.
*/
const FETCH_TIMEOUT_MS = 10_000;

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

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to read a page.', 401);

  if (!checkRateLimit(`fetch-url:${limitKey(user.id, request.headers)}`, FETCH_URL_RATE_LIMIT)) {
    return fail("That's the page reads for today. They reset at midnight UTC.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const { url } = (body ?? {}) as Record<string, unknown>;
  if (typeof url !== 'string' || !url) return fail('URL is required.');

  // This fetch happens from our server, inside our network, to an address a
  // stranger typed. Without this guard it will happily fetch the cloud metadata
  // endpoint or something on the private network and hand back the body.
  const checked = checkPublicHttpUrl(url);
  if (!checked.ok) return fail(checked.reason);
  const parsed = checked.url;

  try {
    const pageRes = await fetch(parsed.toString(), {
      // Honest, for the reasons spelled out in lib/audit/fetcher.ts: the
      // `Mozilla/5.0 (compatible; ...)` disguise this used to send is the exact
      // shape WAFs 403 on, so it lost us pages it was meant to win.
      headers: { 'User-Agent': 'FaqFlo/2.0 (+https://faqflo.com)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!pageRes.ok) {
      return fail(`Could not fetch that page (HTTP ${pageRes.status}).`);
    }

    const contentType = pageRes.headers.get('content-type') ?? '';
    if (!contentType.includes('html') && !contentType.includes('text')) {
      return fail('That URL does not look like a web page.');
    }

    const text = extractText(await pageRes.text());
    if (text.length < 50) {
      return fail("We couldn't pull enough text from that page. Try pasting the content instead.");
    }

    return NextResponse.json({ content: text });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return fail('That page took too long to respond.', 504);
    }
    return fail(`Failed to fetch that URL: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}
