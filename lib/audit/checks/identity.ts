/**
 * Citation & source readiness, and Authority & trust.
 *
 * Two pillars, one file, because they read the same evidence: who does this
 * site belong to, and is that stated in a way a machine can repeat?
 *
 * The distinction between them:
 *   - Citation readiness is machine-facing — can an assistant identify and
 *     attribute you without guessing.
 *   - Authority is human-facing — the pages and signals that make a source
 *     worth repeating in the first place.
 */

import { allPages, type PageSet } from '../fetcher';
import { findNode, schemaNodes } from '../parse';
import type { Finding } from '../types';

export function citationChecks(set: PageSet): Finding[] {
  const P = 'citation' as const;
  const pages = allPages(set);
  const nodes = schemaNodes(pages.flatMap((p) => p.facts.schemaRaw));
  const findings: Finding[] = [];

  /* Business identity in schema ------------------------------------------- */
  {
    const org = findNode(nodes, /^(Organization|LocalBusiness|.*Business|Store|Restaurant)$/);
    const hasName = Boolean(org && typeof org.name === 'string' && org.name);
    const hasUrl = Boolean(org && typeof org.url === 'string' && org.url);

    findings.push({
      id: 'org-schema',
      pillar: P,
      label: 'Business identified in structured data',
      status: org && hasName && hasUrl ? 'pass' : org ? 'warn' : 'fail',
      detail:
        org && hasName && hasUrl
          ? `Structured data names the business (${String(org.name)}) and its URL, so an assistant can attribute an answer to you rather than to "a roofing site".`
          : org
            ? 'There is business markup, but it is missing a name or a url — the two fields an assistant needs to credit you.'
            : 'No Organization or LocalBusiness markup. Nothing on the page tells a machine which business these answers belong to.',
      weight: 3,
    });
  }

  /* sameAs profiles --------------------------------------------------------- */
  {
    const withSameAs = nodes.find((n) => Array.isArray(n.sameAs) && (n.sameAs as unknown[]).length);
    const count = withSameAs ? (withSameAs.sameAs as unknown[]).length : 0;

    findings.push({
      id: 'same-as',
      pillar: P,
      label: 'Linked to external profiles',
      status: count >= 2 ? 'pass' : count === 1 ? 'warn' : 'fail',
      detail:
        count >= 2
          ? `${count} sameAs links tie this site to profiles elsewhere, which is how an engine confirms you are one entity across the web.`
          : 'No sameAs links in your structured data. They connect your site to your other profiles so an engine can be confident it is the same business.',
      weight: 2,
    });
  }

  /* Contact details ---------------------------------------------------------- */
  {
    const text = pages.map((p) => p.facts.text).join(' ');
    const html = pages.map((p) => p.html).join(' ');
    const hasPhone = /\btel:/i.test(html) || /\b(\+?\d[\d\s().-]{7,}\d)\b/.test(text);
    const hasEmail = /\bmailto:/i.test(html) || /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
    const found = [hasPhone && 'phone', hasEmail && 'email'].filter(Boolean) as string[];

    findings.push({
      id: 'contactable',
      pillar: P,
      label: 'Contact details on the page',
      status: found.length >= 1 ? 'pass' : 'fail',
      detail:
        found.length >= 1
          ? `Contact details are present (${found.join(' and ')}), which is part of how an assistant judges a business as real.`
          : 'No phone number or email address anywhere in the crawled pages.',
      weight: 2,
    });
  }

  /* Freshness ---------------------------------------------------------------- */
  {
    const dated = nodes.some((n) => n.dateModified || n.datePublished);
    const textDate = pages.some((p) =>
      /(last updated|updated on|published on)\s*:?\s*\w/i.test(p.facts.text),
    );

    findings.push({
      id: 'freshness',
      pillar: P,
      label: 'Content is dated',
      status: dated ? 'pass' : textDate ? 'warn' : 'fail',
      detail: dated
        ? 'Structured data carries a published or modified date, so an engine can tell how current these answers are.'
        : textDate
          ? 'A date appears in the copy but not in structured data, so a machine has to parse it out of prose.'
          : 'Nothing dates this content. Assistants prefer sources they can tell are current, and undated pages age badly.',
      weight: 2,
    });
  }

  /* Outbound sources ---------------------------------------------------------- */
  {
    const external = new Set(pages.flatMap((p) => p.facts.links.external));
    findings.push({
      id: 'sources',
      pillar: P,
      label: 'Cites anything outside itself',
      status: external.size >= 3 ? 'pass' : external.size >= 1 ? 'warn' : 'warn',
      detail:
        external.size >= 3
          ? `${external.size} outbound links. Pages that cite sources read as researched rather than promotional.`
          : 'Almost no outbound links. Citing a standard, a supplier or a regulator is a cheap credibility signal.',
      weight: 1,
    });
  }

  /* llms.txt ------------------------------------------------------------------- */
  findings.push({
    id: 'llms-txt',
    pillar: P,
    label: 'llms.txt published',
    status: set.llmsTxt ? 'pass' : 'warn',
    detail: set.llmsTxt
      ? 'An llms.txt is published at the site root.'
      : 'No llms.txt. It is a convention rather than a standard, and it costs one file — FaqFlo generates yours.',
    weight: 1,
  });

  return findings;
}

export function authorityChecks(set: PageSet): Finding[] {
  const P = 'authority' as const;
  const pages = allPages(set);
  const nodes = schemaNodes(pages.flatMap((p) => p.facts.schemaRaw));
  const findings: Finding[] = [];

  const urls = pages.map((p) => p.finalUrl.toLowerCase());
  const linked = new Set(
    pages.flatMap((p) => p.facts.links.internal.map((l) => l.toLowerCase())),
  );
  const known = [...urls, ...linked];

  const hasPage = (pattern: RegExp) => known.some((u) => pattern.test(u));

  /* The pages that say who you are ------------------------------------------- */
  {
    const about = hasPage(/\/(about|our-story|who-we-are|team)/);
    const contact = hasPage(/\/(contact|get-in-touch|book|quote)/);
    const present = [about && 'about', contact && 'contact'].filter(Boolean) as string[];

    findings.push({
      id: 'identity-pages',
      pillar: P,
      label: 'About and contact pages exist',
      status: present.length === 2 ? 'pass' : present.length === 1 ? 'warn' : 'fail',
      detail:
        present.length === 2
          ? 'Both an about page and a contact page were found.'
          : present.length === 1
            ? `Found a ${present[0]} page but not the other. Both are basic trust signals for a machine and a person alike.`
            : 'No about or contact page found in the crawl. A site with neither is hard to trust and harder to attribute.',
      weight: 3,
    });
  }

  /* Policy pages ---------------------------------------------------------------- */
  findings.push({
    id: 'policy-pages',
    pillar: P,
    label: 'Privacy or terms page',
    status: hasPage(/\/(privacy|terms|legal)/) ? 'pass' : 'warn',
    detail: hasPage(/\/(privacy|terms|legal)/)
      ? 'A privacy or terms page was found.'
      : 'No privacy or terms page found. It is a small signal, but its absence stands out on a commercial site.',
    weight: 1,
  });

  /* Authorship -------------------------------------------------------------------- */
  {
    const authorNode = nodes.some((n) => n.author);
    const byline = pages.some((p) => /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(p.facts.text));
    findings.push({
      id: 'authorship',
      pillar: P,
      label: 'Content has an author',
      status: authorNode ? 'pass' : byline ? 'warn' : 'fail',
      detail: authorNode
        ? 'Structured data names an author, so answers can be attributed to a person as well as a business.'
        : byline
          ? 'A byline appears in the text but is not in structured data, so a machine has to infer it.'
          : 'Nothing names who wrote this. Attributable content is easier to trust and easier to cite.',
      weight: 2,
    });
  }

  /* Social proof ---------------------------------------------------------------- */
  {
    const types = new Set(pages.flatMap((p) => p.facts.schemaTypes));
    const hasReviewMarkup = [...types].some((t) => /^(Review|AggregateRating)$/.test(t));
    const mentionsProof = pages.some((p) =>
      /(testimonial|review|rated|stars|customers say)/i.test(p.facts.text),
    );

    findings.push({
      id: 'social-proof',
      pillar: P,
      label: 'Reviews or testimonials',
      status: hasReviewMarkup ? 'pass' : mentionsProof ? 'warn' : 'fail',
      detail: hasReviewMarkup
        ? 'Review or rating markup is present, which is the machine-readable form of social proof.'
        : mentionsProof
          ? 'Testimonials appear in the copy but carry no markup, so a machine cannot read them as reviews.'
          : 'No reviews or testimonials found. They are one of the strongest trust signals a local business has.',
      weight: 2,
    });
  }

  /* Name consistency -------------------------------------------------------------- */
  {
    const org = findNode(nodes, /^(Organization|LocalBusiness|.*Business)$/);
    const schemaName = org && typeof org.name === 'string' ? org.name : null;
    const title = set.entry.facts.title ?? '';

    findings.push(
      !schemaName
        ? {
            id: 'name-consistency',
            pillar: P,
            label: 'Business name used consistently',
            status: 'na',
            detail: 'No business name in structured data to compare against the page title.',
            weight: 1,
          }
        : {
            id: 'name-consistency',
            pillar: P,
            label: 'Business name used consistently',
            status: title.toLowerCase().includes(schemaName.toLowerCase()) ? 'pass' : 'warn',
            detail: title.toLowerCase().includes(schemaName.toLowerCase())
              ? `"${schemaName}" appears in both the structured data and the page title.`
              : `Structured data says "${schemaName}" but the page title does not contain it. Engines resolve entities by matching names — inconsistency splits you into two.`,
            weight: 1,
          },
    );
  }

  return findings;
}
