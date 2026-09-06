import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

/*
  Security headers.

  ⚠️ THE SITE SHIPPED WITH NONE OF THESE, AND THE PRACTICAL GAP WAS
  CLICKJACKING: nothing stopped /dashboard being loaded in someone else's
  iframe. The four below cannot break a working page — they restrict things this
  app never does — so they are enforced.

  ⚠️ THE CSP IS REPORT-ONLY, AND ENFORCING IT IS A SEPARATE DECISION. Three
  things on this site would break under a strict policy today: the inline
  no-flash theme script (components/dashboard/theme.tsx), Google Tag Manager,
  and Cloudflare Insights. Report-only changes no behaviour and surfaces every
  violation in the browser console, which is what makes the next step
  measurable rather than a guess.

  ⚠️ frame-ancestors IS NOT WHAT STOPS FRAMING HERE. In a Report-Only policy it
  is reported, not enforced — X-Frame-Options below is the one actually doing
  the work until the CSP is enforced. Do not delete it as a legacy duplicate.

  ⚠️ AND THERE IS NO report-uri. Nothing collects these, so violations appear in
  devtools and nowhere else. That is honest as a starting point, not a
  monitoring solution.
*/
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // 'unsafe-inline' is what the theme script needs; a nonce is the way out of it.
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://cloudflareinsights.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  /* The enforced anti-framing control. See the note above. */
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...SECURITY_HEADERS,
          /*
            ⚠️ HSTS IN PRODUCTION ONLY. A browser that receives this on
            localhost pins http://localhost to https for a year, and the next
            `npm run dev` refuses to load over plain HTTP — a self-inflicted
            outage that survives restarting the server and is fixed only by
            clearing the pin in chrome://net-internals.

            No `preload` directive: submitting to the preload list is close to
            irreversible and applies to every subdomain, which is a decision to
            make on purpose rather than to inherit from a security pass.
          */
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },
  // Lets .mdx files be imported as components. Blog posts live in content/,
  // not app/, so this changes no routing today — it only matters if an .mdx
  // file is ever dropped into app/.
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  experimental: {
    // TypeScript 7 dropped the compiler API Next.js uses by default. This routes
    // type checking through the `tsc` CLI so we can stay on TS 7 rather than
    // pinning back to 6.
    useTypeScriptCli: true,
  },
};

/*
  No remark or rehype plugins, deliberately.

  This project builds with Turbopack, where plugins have to be named as strings
  and "plugins without serializable options cannot be used yet, because
  JavaScript functions can't be passed to Rust" (next/dist/docs — mdx guide).
  Posts export their metadata as a plain `export const meta` rather than YAML
  frontmatter, which @next/mdx supports natively, so there is nothing here that
  needs a plugin.
*/
const withMDX = createMDX({});

export default withMDX(nextConfig);
