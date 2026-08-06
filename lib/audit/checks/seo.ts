/**
 * Classic on-page SEO.
 *
 * Still here, still true. AEO didn't replace this — an engine that can't work
 * out what a page is about from its title and headings isn't going to quote it
 * either. The multi-page fetch is what makes the uniqueness checks possible:
 * duplicate titles are invisible from a single page.
 */

import { allPages, type PageSet } from '../fetcher';
import type { Finding } from '../types';

const P = 'seo' as const;

const TITLE_MIN = 15;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

export function seoChecks(set: PageSet): Finding[] {
  const pages = allPages(set);
  const findings: Finding[] = [];

  /* Titles ---------------------------------------------------------------- */
  {
    const missing = pages.filter((p) => !p.facts.title);
    const badLength = pages.filter(
      (p) => p.facts.title && (p.facts.title.length < TITLE_MIN || p.facts.title.length > TITLE_MAX),
    );

    findings.push({
      id: 'title',
      pillar: P,
      label: 'Every page has a title',
      status: missing.length === 0 ? 'pass' : missing.length < pages.length ? 'warn' : 'fail',
      detail:
        missing.length === 0
          ? `All ${pages.length} scanned ${pages.length === 1 ? 'page has' : 'pages have'} a title tag.`
          : `${missing.length} of ${pages.length} pages have no title tag. It is the single strongest signal of what a page is about.`,
      weight: 3,
      evidence: missing.map((p) => p.finalUrl).slice(0, 5),
    });

    findings.push(
      pages.every((p) => !p.facts.title)
        ? {
            id: 'title-length',
            pillar: P,
            label: 'Titles are a usable length',
            status: 'na',
            detail: 'No titles to measure.',
            weight: 1,
          }
        : {
            id: 'title-length',
            pillar: P,
            label: 'Titles are a usable length',
            status: badLength.length === 0 ? 'pass' : 'warn',
            detail:
              badLength.length === 0
                ? `Titles sit within ${TITLE_MIN}–${TITLE_MAX} characters.`
                : `${badLength.length} ${badLength.length === 1 ? 'title is' : 'titles are'} outside ${TITLE_MIN}–${TITLE_MAX} characters, so they get cut off or say too little.`,
            weight: 1,
            evidence: badLength
              .map((p) => `${p.facts.title!.length} chars — ${p.facts.title}`)
              .slice(0, 4),
          },
    );

    // Only meaningful once more than one page was fetched.
    const titled = pages.filter((p) => p.facts.title);
    const dupes = duplicates(titled.map((p) => p.facts.title!.toLowerCase()));
    findings.push(
      titled.length < 2
        ? {
            id: 'title-unique',
            pillar: P,
            label: 'Titles are unique',
            status: 'na',
            detail: 'Only one page was scanned, so there is nothing to compare titles against.',
            weight: 2,
          }
        : {
            id: 'title-unique',
            pillar: P,
            label: 'Titles are unique',
            status: dupes.length === 0 ? 'pass' : 'fail',
            detail:
              dupes.length === 0
                ? `All ${titled.length} scanned pages have their own title.`
                : `${dupes.length} title${dupes.length === 1 ? ' is' : 's are'} used on more than one page. Identical titles make pages compete with each other.`,
            weight: 2,
            evidence: dupes.slice(0, 4),
          },
    );
  }

  /* Meta descriptions ------------------------------------------------------ */
  {
    const missing = pages.filter((p) => !p.facts.metaDescription);
    const badLength = pages.filter(
      (p) =>
        p.facts.metaDescription &&
        (p.facts.metaDescription.length < DESC_MIN || p.facts.metaDescription.length > DESC_MAX),
    );

    findings.push({
      id: 'meta-description',
      pillar: P,
      label: 'Pages have meta descriptions',
      status: missing.length === 0 ? 'pass' : missing.length < pages.length ? 'warn' : 'fail',
      detail:
        missing.length === 0
          ? `All ${pages.length} scanned pages have a meta description.`
          : `${missing.length} of ${pages.length} pages have no meta description, so engines write their own summary from whatever text they find first.`,
      weight: 2,
      evidence: missing.map((p) => p.finalUrl).slice(0, 5),
    });

    findings.push(
      pages.every((p) => !p.facts.metaDescription)
        ? {
            id: 'meta-length',
            pillar: P,
            label: 'Descriptions are a usable length',
            status: 'na',
            detail: 'No meta descriptions to measure.',
            weight: 1,
          }
        : {
            id: 'meta-length',
            pillar: P,
            label: 'Descriptions are a usable length',
            status: badLength.length === 0 ? 'pass' : 'warn',
            detail:
              badLength.length === 0
                ? `Descriptions sit within ${DESC_MIN}–${DESC_MAX} characters.`
                : `${badLength.length} description${badLength.length === 1 ? ' is' : 's are'} outside ${DESC_MIN}–${DESC_MAX} characters.`,
            weight: 1,
          },
    );
  }

  /* H1 --------------------------------------------------------------------- */
  {
    const wrong = pages.filter((p) => p.facts.headings.filter((h) => h.level === 1).length !== 1);
    findings.push({
      id: 'h1',
      pillar: P,
      label: 'One H1 per page',
      status: wrong.length === 0 ? 'pass' : wrong.length < pages.length ? 'warn' : 'fail',
      detail:
        wrong.length === 0
          ? `All ${pages.length} scanned pages have exactly one H1.`
          : `${wrong.length} of ${pages.length} pages have no H1, or more than one. The H1 is the page's headline claim about itself.`,
      weight: 2,
      evidence: wrong
        .map((p) => `${p.facts.headings.filter((h) => h.level === 1).length} H1s — ${p.finalUrl}`)
        .slice(0, 4),
    });
  }

  /* Image alt text ---------------------------------------------------------- */
  {
    const total = pages.reduce((n, p) => n + p.facts.images.total, 0);
    const withAlt = pages.reduce((n, p) => n + p.facts.images.withAlt, 0);
    const coverage = total === 0 ? 1 : withAlt / total;

    findings.push(
      total === 0
        ? {
            id: 'alt-text',
            pillar: P,
            label: 'Images have alt text',
            status: 'na',
            detail: 'No images found on the scanned pages.',
            weight: 1,
          }
        : {
            id: 'alt-text',
            pillar: P,
            label: 'Images have alt text',
            status: coverage >= 0.9 ? 'pass' : coverage >= 0.6 ? 'warn' : 'fail',
            detail: `${withAlt} of ${total} images have an alt attribute (${Math.round(coverage * 100)}%). Alt text is the only thing a text-only reader gets from an image.`,
            weight: 1,
          },
    );
  }

  /* Internal linking --------------------------------------------------------- */
  {
    const links = set.entry.facts.links.internal.length;
    findings.push({
      id: 'internal-links',
      pillar: P,
      label: 'Pages link to each other',
      status: links >= 5 ? 'pass' : links >= 1 ? 'warn' : 'fail',
      detail:
        links >= 5
          ? `The entry page links to ${links} other pages on the site, so a crawler can find its way around.`
          : `Only ${links} internal ${links === 1 ? 'link' : 'links'} on the entry page. Crawlers discover pages by following links.`,
      weight: 2,
    });
  }

  /* Open Graph ---------------------------------------------------------------- */
  {
    const og = set.entry.facts.openGraph;
    const have = [og.title, og.description, og.image].filter(Boolean).length;
    findings.push({
      id: 'open-graph',
      pillar: P,
      label: 'Social preview tags',
      status: have === 3 ? 'pass' : have > 0 ? 'warn' : 'fail',
      detail:
        have === 3
          ? 'Open Graph title, description and image are all set.'
          : `${have} of 3 Open Graph tags are set, so links to this page will preview badly when shared.`,
      weight: 1,
    });
  }

  /* Depth ---------------------------------------------------------------------- */
  {
    const thin = pages.filter((p) => p.facts.wordCount < 300);
    findings.push({
      id: 'word-count',
      pillar: P,
      label: 'Pages have enough content',
      status: thin.length === 0 ? 'pass' : thin.length < pages.length ? 'warn' : 'fail',
      detail:
        thin.length === 0
          ? `All ${pages.length} scanned pages carry a reasonable amount of text.`
          : `${thin.length} of ${pages.length} pages have under 300 words. Thin pages rarely have enough substance to be worth quoting.`,
      weight: 2,
      evidence: thin.map((p) => `${p.facts.wordCount} words — ${p.finalUrl}`).slice(0, 4),
    });
  }

  return findings;
}

function duplicates(values: string[]): string[] {
  const seen = new Map<string, number>();
  for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([v, n]) => `${v} (×${n})`);
}
