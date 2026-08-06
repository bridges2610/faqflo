'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { canPublish } from '@/lib/dashboard/plans';
import { timeAgo } from '@/lib/dashboard/format';
import {
  buildFaqHtml,
  buildLlmsTxt,
  buildSchemaBlock,
  PLACEMENT_NOTES,
  publishState,
} from '@/lib/dashboard/export';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { UpgradeCard } from './upgrade-card';

/*
  Publish: the copy-paste export.

  This is the whole delivery mechanism. There is no script tag and no plugin —
  the customer pastes real HTML into their own site, because that is the only
  form of delivery an AI crawler can actually read.
*/

function CopyBlock({
  title,
  description,
  code,
  language,
}: {
  title: string;
  description: string;
  code: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard refused (insecure context or permissions) — the code is on
      // screen and selectable, so there's nothing to recover.
    }
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg">{title}</h2>
          <p className="text-slate mt-1 text-sm leading-relaxed">{description}</p>
        </div>
        <button
          onClick={copy}
          className="text-primary hover:text-primary-hover shrink-0 text-sm font-medium transition-colors duration-150"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      {/* Capped height with its own scrollbar: a long answer set runs to
          hundreds of lines, and a block that grows without limit pushes
          everything below it off the page. */}
      <pre className="bg-navy mt-4 max-h-80 overflow-auto rounded-xl p-4">
        <code className="font-mono text-[0.75rem] leading-relaxed whitespace-pre text-white/90">
          {code}
        </code>
      </pre>
      <p className="text-slate mt-2 font-mono text-[0.6875rem] tracking-wide uppercase">
        {language}
      </p>
    </Card>
  );
}

/** The out-of-date nudge — the accepted cost of not needing a plugin. */
function PublishStatus() {
  const { site, faqs, markPublished } = useDashboard();
  if (!site) return null;

  const state = publishState(site, faqs);

  if (state === 'nothing-to-publish') {
    return (
      <Card tone="cloud" className="p-5">
        <p className="text-slate text-sm">
          Nothing is published yet, so there is nothing to paste. Publish an answer on the FAQs page
          and the export appears here.
        </p>
      </Card>
    );
  }

  if (state === 'stale') {
    return (
      <Card className="border-primary p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg">Your live copy is out of date</h2>
              <Badge tone="neutral">Last pasted {timeAgo(site.publishedAt)}</Badge>
            </div>
            <p className="text-slate mt-1.5 text-sm leading-relaxed">
              Your answers have changed since you last pasted them onto {site.domain}. Copy the
              block below again and replace what&rsquo;s there, then mark it done.
            </p>
          </div>
          <Button size="sm" onClick={() => markPublished(site.id)}>
            I&rsquo;ve pasted the update
          </Button>
        </div>
      </Card>
    );
  }

  if (state === 'never') {
    return (
      <Card className="border-primary p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg">Not on your site yet</h2>
            <p className="text-slate mt-1.5 text-sm leading-relaxed">
              None of this counts until the HTML is actually on {site.domain}. Paste the block
              below, then tell us it&rsquo;s live so we can start watching for citations.
            </p>
          </div>
          <Button size="sm" onClick={() => markPublished(site.id)}>
            I&rsquo;ve pasted it
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card tone="cloud" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-slate text-sm">
          Your live copy matches what&rsquo;s here. Last pasted {timeAgo(site.publishedAt)}.
        </p>
        <Badge tone="success">Up to date</Badge>
      </div>
    </Card>
  );
}

export function PublishWorkspace() {
  const { site, faqs } = useDashboard();

  if (!site) {
    return (
      <>
        <PageHeader title="Publish" description="The HTML that goes on your own site." />
        <EmptyState
          title="Add a site first"
          body="The export is built per site, from that site's published answers."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  if (!canPublish(site)) {
    return (
      <>
        <PageHeader
          title="Publish"
          description={`The crawlable HTML for ${site.domain}, ready to paste.`}
        />
        <UpgradeCard
          entitlement="get_cited"
          siteName={site.name}
          title="Publish-ready export"
          body="Clean HTML with your answers in it, the schema that identifies your business to a machine, and an llms.txt — all built for this site and pasted onto your own domain, so the citation goes to you."
        />
      </>
    );
  }

  const html = buildFaqHtml(site, faqs);
  const schema = buildSchemaBlock(site, faqs);
  const llms = buildLlmsTxt(site, faqs);

  return (
    <>
      <PageHeader
        title="Publish"
        description={`Paste these onto ${site.domain}. No plugin, no script — this is plain HTML, because AI crawlers don't run JavaScript.`}
      />

      <div className="space-y-5">
        <PublishStatus />

        {html && (
          <>
            <CopyBlock
              title="1. The answers"
              description="Paste this into the page where the answers should appear. It's plain semantic HTML — it will pick up your site's own styling."
              code={html}
              language="HTML"
            />

            <CopyBlock
              title="2. The schema"
              description="Paste this on the same page, anywhere. It tells a machine which text is a question, which is the answer, and which business they belong to."
              code={schema}
              language="JSON-LD"
            />

            <CopyBlock
              title="3. llms.txt"
              description="Save this as llms.txt at the root of your site. It's a convention rather than a standard, and it costs one file to follow."
              code={llms}
              language="Plain text · /llms.txt"
            />
          </>
        )}

        <Card className="p-5 sm:p-7">
          <h2 className="text-lg">Where it goes</h2>
          <p className="text-slate mt-1 text-sm leading-relaxed">
            Every builder has somewhere to put raw HTML. Find yours below.
          </p>

          <ul className="divide-line mt-4 divide-y">
            {PLACEMENT_NOTES.map((p) => (
              <li key={p.platform} className="py-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-navy text-[0.9375rem] font-semibold">{p.platform}</span>
                  {p.warning && <Badge tone="neutral">Read this one</Badge>}
                </div>
                <p
                  className={`mt-1 text-sm leading-relaxed ${
                    p.warning ? 'text-error-ink' : 'text-slate'
                  }`}
                >
                  {p.note}
                </p>
              </li>
            ))}
          </ul>

          <p className="border-line text-slate mt-5 border-t pt-4 text-xs leading-relaxed">
            Not sure whether yours wraps embeds in an iframe? Load the published page, view source,
            and search for one of your questions. If the text isn&rsquo;t there, a crawler
            can&rsquo;t see it either — put the answers in a native text section instead.
          </p>
        </Card>
      </div>
    </>
  );
}
