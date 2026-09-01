import { NextResponse } from 'next/server';
import { safeFetch, safeFetchBytes } from '@/lib/audit/safe-fetch';
import { iconHref } from '@/lib/audit/icon-href';
import { checkPublicHttpUrl } from '@/lib/audit/url-guard';
import { currentUser } from '@/lib/auth/dal';
import { normalizeDomain } from '@/lib/dashboard/domain';
import { checkRateLimit, FAVICON_RATE_LIMIT, limitKey } from '@/lib/rate-limit';

/*
  A competitor's site icon, served from our own domain.

  ⚠️ THE WHOLE POINT IS THAT NOTHING LEAVES THE BROWSER EXCEPT A REQUEST TO US.
  The one-line version of this feature points an <img> at Google's favicon
  service, which tells Google every competitor domain a customer is watching —
  their commercial information, handed to a third party, for decoration, on the
  page about who is beating them. Proxying costs this file and leaks nothing.

  ⚠️ IT REUSES THE AUDIT CRAWLER'S GUARDS AND MUST KEEP DOING SO. This fetches
  an address derived from something a customer typed, from our server, inside
  our network — the same shape of hazard app/api/fetch-url/route.ts documents.
  lib/audit/url-guard.ts refuses private ranges, loopback and cloud metadata;
  safeFetchBytes re-checks every redirect hop against it and caps the body.
  Read the header of lib/audit/safe-fetch.ts before changing how the request is
  made.

  ⚠️ SIGNED-IN ONLY, UNLIKE fetch-url. That route serves the marketing page and
  has to be anonymous. This one only ever renders inside the Pro dashboard, so
  requiring a session costs nothing and keeps it from being a general-purpose
  image proxy for strangers.

  ⚠️ EVERY FAILURE IS A 204, NEVER AN ERROR. The caller draws a lettermark when
  no image arrives, and that is a perfectly good outcome — most small trade
  sites have no usable icon. A 4xx here would put a red line in the customer's
  console for something that is working as intended.
*/

const UA = 'FaqFloBot/1.0 (+https://faqflo.com/bot)';

/** Icons are small. Anything larger is not an icon, whatever it claims. */
const MAX_ICON_BYTES = 200 * 1024;

/** How long a browser may keep one. Icons change rarely; a day is plenty. */
const BROWSER_TTL = 60 * 60 * 24;

/*
  A tiny in-process cache in front of the network.

  Instances are reused between requests on Fluid Compute, so this absorbs the
  repeat views that dominate — six domains on a page somebody opens ten times a
  day. It is deliberately not a correctness mechanism: a cold instance simply
  fetches again, and `null` is cached too so a site with no icon is not
  re-fetched on every render.
*/
type Hit = { bytes: Uint8Array; type: string } | null;
const CACHE = new Map<string, { at: number; hit: Hit }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const CACHE_MAX = 500;

function cached(domain: string): Hit | undefined {
  const row = CACHE.get(domain);
  if (!row) return undefined;
  if (Date.now() - row.at > CACHE_TTL_MS) {
    CACHE.delete(domain);
    return undefined;
  }
  return row.hit;
}

function remember(domain: string, hit: Hit) {
  // Crude, and enough: drop the oldest key when the map gets long.
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest) CACHE.delete(oldest);
  }
  CACHE.set(domain, { at: Date.now(), hit });
}

/** No image, and that is a normal answer. */
function none() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': `public, max-age=${BROWSER_TTL}` },
  });
}

/** Fetch one candidate and accept it only if it is really an image. */
async function tryIcon(url: string): Promise<Hit> {
  const res = await safeFetchBytes(url, UA);
  if (!res.ok) return null;

  const type = (res.contentType ?? '').split(';')[0].trim().toLowerCase();
  /* ⚠️ THE CONTENT TYPE IS CHECKED, NOT TRUSTED FROM THE PATH. A great many
     sites answer 200 with an HTML error page at /favicon.ico, and serving that
     back as an image would render a broken icon rather than the lettermark. */
  if (!type.startsWith('image/')) return null;
  if (res.body.byteLength === 0 || res.body.byteLength > MAX_ICON_BYTES) return null;

  return { bytes: res.body, type };
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return none();

  if (!checkRateLimit(limitKey(user.id, request.headers), FAVICON_RATE_LIMIT)) return none();

  const raw = new URL(request.url).searchParams.get('d') ?? '';
  const domain = normalizeDomain(raw);
  if (!domain || domain.length > 255) return none();

  const guard = checkPublicHttpUrl(`https://${domain}`);
  if (!guard.ok) return none();

  const hit = cached(domain);
  if (hit !== undefined) return hit ? send(hit) : none();

  /* The conventional path first — it costs one request and works for most
     sites — then the page's own declaration, which is what catches the rest. */
  let found = await tryIcon(`https://${domain}/favicon.ico`);

  if (!found) {
    const page = await safeFetch(`https://${domain}`, UA);
    if (page.ok) {
      const href = iconHref(page.body, new URL(page.finalUrl));
      if (href) found = await tryIcon(href);
    }
  }

  remember(domain, found);
  return found ? send(found) : none();
}

function send({ bytes, type }: { bytes: Uint8Array; type: string }) {
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': `public, max-age=${BROWSER_TTL}`,
      // It is somebody else's image; never let it be framed or sniffed into
      // something executable.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
