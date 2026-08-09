'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { matchMustHave, type MustHaveResult } from '@/lib/content';
import { canContent } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import type { ArticleTopic, ContentPlan, MustHavePage } from '@/lib/dashboard/types';
import { CopyIcon, TickIcon } from './nav-icons';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { StatTile } from './stat-tile';
import { UpgradeCard } from './upgrade-card';

/*
  Content: the pages this kind of business is expected to have, and what to
  write next.

  Every other page in the dashboard works on questions that already exist —
  discovered, answered, published, tracked. This one is about what isn't there
  yet, which is why it reads from the crawl rather than from the answer set: the
  gap between the site you have and the site your industry expects.

  The two halves come from a single generation and are stored together. Nothing
  here calls the model on render — a plan that rewrote itself on every visit
  would be a slot machine, not a plan.
*/

type Generated = {
  profile: { industry: string; location: string };
  mustHave: MustHavePage[];
  topics: ArticleTopic[];
};

/** Present with answers / present without / absent. Never colour alone. */
function RoleRow({ result }: { result: MustHaveResult }) {
  const page = result.page;
  const answers = page?.hasFaqSchema ? page.faqQuestions.length : 0;

  const state = !page
    ? { tone: 'neutral' as const, word: 'Missing' }
    : answers > 0
      ? { tone: 'success' as const, word: 'Has answers' }
      : { tone: 'cyan' as const, word: 'No answers' };

  return (
    <li className="border-line flex flex-col gap-1.5 border-b py-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="sm:w-44 sm:shrink-0">
        <p className="text-navy text-[0.9375rem] font-semibold">{result.label}</p>
        <Badge tone={state.tone} className="mt-1.5">
          {state.word}
        </Badge>
      </div>

      <div className="min-w-0 flex-1">
        {page ? (
          <>
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-sm break-all hover:underline"
            >
              {page.url}
            </a>
            <p className="text-slate mt-1 text-sm leading-relaxed">
              {answers > 0
                ? `Answers ${answers} question${answers === 1 ? '' : 's'} in markup an assistant can read.`
                : 'No question-and-answer markup on this page, so nothing here is quotable as an answer.'}
            </p>
          </>
        ) : (
          <p className="text-slate text-sm leading-relaxed">{result.why}</p>
        )}
      </div>
    </li>
  );
}

function TopicCard({ topic }: { topic: ArticleTopic }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    // Everything a writer needs to start, not just the headline.
    const brief = [
      topic.title,
      '',
      `Angle: ${topic.angle}`,
      `Search term: ${topic.primaryKeyword}`,
      `Question to answer: ${topic.aeoQuestion}`,
      `Why: ${topic.why}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A denied clipboard is not worth an error state — the text is on screen.
    }
  }

  return (
    <Card as="li" className="flex flex-col gap-3 p-5">
      <div>
        <h3 className="text-navy text-[0.9375rem] leading-snug font-semibold">{topic.title}</h3>
        <p className="text-slate mt-1.5 text-sm leading-relaxed">{topic.angle}</p>
      </div>

      <dl className="text-sm">
        <div className="flex gap-2">
          <dt className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">Asked</dt>
          <dd className="text-navy min-w-0 flex-1">{topic.aeoQuestion}</dd>
        </div>
        <div className="mt-1.5 flex gap-2">
          <dt className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">Search</dt>
          <dd className="text-slate min-w-0 flex-1">{topic.primaryKeyword}</dd>
        </div>
      </dl>

      <p className="text-slate border-line border-t pt-3 text-sm leading-relaxed">{topic.why}</p>

      <div>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy brief'}
        </Button>
      </div>
    </Card>
  );
}

/** Industry and area, editable — we may have inferred them, and may be wrong. */
function ProfileLine({
  industry,
  location,
  source,
  onSave,
}: {
  industry: string | null;
  location: string | null;
  source: string | null;
  onSave: (industry: string, location: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [nextIndustry, setNextIndustry] = useState(industry ?? '');
  const [nextLocation, setNextLocation] = useState(location ?? '');
  const [saving, setSaving] = useState(false);

  const field =
    'border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150';

  if (editing) {
    return (
      <Card tone="cloud" className="mb-6 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Industry
            </span>
            <input
              className={field}
              value={nextIndustry}
              onChange={(e) => setNextIndustry(e.target.value)}
              placeholder="Roofing contractor"
            />
          </label>
          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Service area
            </span>
            <input
              className={field}
              value={nextLocation}
              onChange={(e) => setNextLocation(e.target.value)}
              placeholder="Franklin, TN"
            />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(nextIndustry, nextLocation);
              setSaving(false);
              setEditing(false);
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="text-slate text-sm">
        <span className="text-navy font-semibold">{industry || 'Industry not set'}</span>
        {location ? <> · {location}</> : null}
      </p>
      {source === 'inferred' && (
        <Badge tone="neutral">Worked out from your site — check it</Badge>
      )}
      <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}

export function ContentWorkspace() {
  const { site, contentPlan, saveContentPlan, renameSite } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const description = 'The pages your industry expects, and what to write next.';

  if (!site) {
    return (
      <>
        <PageHeader title="Content" description={description} />
        <EmptyState
          title="Add a site first"
          body="The content plan is built from your own pages, so there has to be a site to read."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  if (!canContent(site)) {
    return (
      <>
        <PageHeader title="Content" description={description} />
        <UpgradeCard
          entitlement="get_cited"
          siteName={site.name}
          title="Know what's missing before you write"
          body="The pages a business like yours is expected to have, which of yours are missing, and ten things worth writing about your area. Built from a full read of your site, so it names real pages rather than guessing."
        />
      </>
    );
  }

  const pages = site.lastAudit?.pages ?? [];

  if (pages.length === 0) {
    return (
      <>
        <PageHeader title="Content" description={description} />
        <EmptyState
          title="Run a full audit first"
          body="This page is built from the pages we read on your site. Run a full audit and they'll be here."
          action={<ButtonLink href="/dashboard/audit">Go to the audit</ButtonLink>}
        />
      </>
    );
  }

  async function generate() {
    if (!site) return;
    setError(null);
    setBusy(true);

    /*
      Precedence: what a person told us, then what the site's own markup says,
      then nothing — in which case the model infers from the home page.

      The middle step matters. A site publishing LocalBusiness markup has
      already stated its trade and service area; asking a model to guess at
      what it has been told outright is both slower and worse.
    */
    const fromSchema = site.lastAudit?.profile;
    const knownIndustry = site.industry ?? fromSchema?.industry ?? null;
    const knownLocation = site.location ?? fromSchema?.location ?? null;

    try {
      const res = await fetch('/api/dashboard/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: site.domain,
          industry: knownIndustry,
          location: knownLocation,
          hint: site.lastAudit?.profileHint ?? '',
          pages,
        }),
      });

      const data = (await res.json()) as Partial<Generated> & { error?: string };
      if (!res.ok || !data.mustHave || !data.topics || !data.profile) {
        setError(data.error ?? 'That plan failed. Please try again.');
        return;
      }

      const plan: ContentPlan = {
        siteId: site.id,
        industry: data.profile.industry,
        location: data.profile.location || null,
        mustHave: data.mustHave,
        topics: data.topics,
        generatedAt: new Date().toISOString(),
      };
      await saveContentPlan(plan);

      /*
        Write the resolved profile back to the site, but never over a manual
        one. The customer correcting us is the most reliable signal we have,
        and a later generation quietly reverting it would be the feature
        arguing with its user.
      */
      if (site.profileSource !== 'manual' && data.profile.industry) {
        await renameSite(site.id, {
          industry: data.profile.industry,
          location: data.profile.location || null,
          // Only "schema" when the markup supplied both — a half-read profile
          // that the model completed is an inference, and the badge that says
          // "check this" should appear.
          profileSource: knownIndustry && knownLocation ? 'schema' : 'inferred',
        });
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!contentPlan) {
    return (
      <>
        <PageHeader title="Content" description={description} />
        <EmptyState
          title="Build your content plan"
          body={`We'll read the ${pages.length} page${pages.length === 1 ? '' : 's'} we found on ${site.domain}, work out which pages a business like yours is expected to have, and suggest ten things worth writing.`}
          action={
            <Button onClick={generate} disabled={busy}>
              {busy ? 'Working…' : 'Build the plan'}
            </Button>
          }
        />
        {error && (
          <p role="alert" className="text-error-ink mt-4 text-center text-sm">
            {error}
          </p>
        )}
      </>
    );
  }

  const matched = matchMustHave(pages, contentPlan.mustHave);
  const present = matched.filter((m) => m.page);
  const withAnswers = present.filter((m) => m.page?.hasFaqSchema);

  return (
    <>
      <PageHeader
        title="Content"
        description={description}
        action={
          <Button variant="ghost" size="sm" onClick={generate} disabled={busy}>
            {busy ? 'Working…' : 'Regenerate'}
          </Button>
        }
      />

      <ProfileLine
        industry={site.industry ?? contentPlan.industry}
        location={site.location ?? contentPlan.location}
        source={site.profileSource}
        onSave={async (industry, location) => {
          await renameSite(site.id, { industry, location, profileSource: 'manual' });
        }}
      />

      {error && (
        <p role="alert" className="text-error-ink mb-4 text-sm">
          {error}
        </p>
      )}

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Pages expected"
            value={matched.length}
            hint={`For a ${contentPlan.industry.toLowerCase()}`}
          />
          <StatTile
            label="You're missing"
            value={matched.length - present.length}
            hint={present.length === matched.length ? 'Nothing missing' : 'Worth adding'}
          />
          <StatTile
            label="Answering questions"
            value={`${withAnswers.length} of ${present.length}`}
            hint="Pages with Q&A markup"
          />
        </div>

        <Card className="p-5 sm:p-7">
          <h2 className="text-navy text-lg font-bold">The pages your industry expects</h2>
          <p className="text-slate mt-1 text-sm leading-relaxed">
            Matched against the pages we read. A page with no answers on it still can&apos;t be
            quoted, which is why that&apos;s called out separately from missing.
          </p>
          <ul className="mt-4">
            {matched.map((m) => (
              <RoleRow key={m.role} result={m} />
            ))}
          </ul>
        </Card>

        <div>
          <h2 className="text-navy text-lg font-bold">Worth writing next</h2>
          <p className="text-slate mt-1 text-sm leading-relaxed">
            Ten articles aimed at what people ask about{' '}
            {contentPlan.location ? `${contentPlan.industry.toLowerCase()} in ${contentPlan.location}` : contentPlan.industry.toLowerCase()}.
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {contentPlan.topics.map((t) => (
              <TopicCard key={t.title} topic={t} />
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
