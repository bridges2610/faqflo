import { NextResponse } from 'next/server';
import { MAX_CONTENT_CHARS } from '@/lib/faq';

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const { url } = (body ?? {}) as Record<string, unknown>;
  if (typeof url !== 'string' || !url) return fail('URL is required.');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail('Invalid URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return fail('URL must use http or https.');
  }

  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FaqFlo/2.0)' },
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
