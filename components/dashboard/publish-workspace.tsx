'use client';

import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { useCopy } from '@/lib/dashboard/use-copy';
import { canPublish } from '@/lib/dashboard/plans';
import { timeAgo } from '@/lib/dashboard/format';
import {
  buildFaqHtml,
  buildLlmsTxt,
  buildSchemaBlock,
  groupUrl,
  PLACEMENT_NOTES,
  publishState,
} from '@/lib/dashboard/export';
import type { FaqGroup, Site } from '@/lib/dashboard/types';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { UpgradeCard } from './upgrade-card';

/*
  Publish: the copy-paste export, one section per group.

  This is the whole delivery mechanism. There is no script tag and no plugin —
  the customer pastes real HTML into their own site, because that is the only
  form of delivery an AI crawler can actually read.

  Groups are separate sections rather than one merged block because each one
  goes on a different page. Merging them would put the pricing answers on the
  service page and claim schema for both at one URL.
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
  const { copied, copy } = useCopy();

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-navy text-[0.9375rem] font-semibold">{title}</h3>
          <p className="text-slate mt-0.5 text-sm leading-relaxed">{description}</p>
        </div>
        <button
          onClick={() => copy(code)}
          className="text-primary hover:text-primary-hover shrink-0 text-sm font-medium transition-colors duration-150"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      {/* Capped height with its own scrollbar: a long answer set runs to
          hundreds of lines, and a block that grows without limit pushes
          everything below it off the page. */}
      <pre className="bg-navy mt-3 max-h-80 overflow-auto rounded-xl p-4">
        <code className="font-mono text-[0.75rem] leading-relaxed whitespace-pre text-white/90">
          {code}
        </code>
      </pre>
      <p className="text-slate mt-2 font-mono text-[0.6875rem] tracking-wide uppercase">
        {language}
      </p>
    </div>
  );
}

/** One group's export, with its own paste status. */
function GroupSection({ site, group }: { site: Site; group: FaqGroup }) {
  const { faqsIn, markPublished } = useDashboard();
  const faqs = faqsIn(group.id);
  const state = publishState(group, faqs);
  const html = buildFaqHtml(group, faqs);
  const schema = buildSchemaBlock(site, group, faqs);

  return (
    // Wrapper carries the anchor id that "Get the code →" links to. It sits
    // outside the Card because Card takes only the props it means to style.
    <div id={group.id} className="scroll-mt-24">
    <Card className={`p-5 sm:p-7 ${state === 'stale' ? 'border-primary' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="text-lg">{group.name}</h2>
            {state === 'current' && <Badge tone="success">Up to date</Badge>}
            {state === 'stale' && <Badge tone="neutral">Out of date</Badge>}
            {state === 'never' && <Badge tone="neutral">Not pasted yet</Badge>}
          </div>
          <p className="text-slate mt-1 text-sm">
            Goes on <code className="text-navy font-mono text-xs">{groupUrl(site, group)}</code>
          </p>
        </div>

        {state !== 'nothing-to-publish' && (
          <Button size="sm" variant={state === 'current' ? 'ghost' : 'primary'} onClick={() => markPublished(group.id)}>
            {state === 'current' ? 'Pasted again' : "I've pasted it"}
          </Button>
        )}
      </div>

      {state === 'nothing-to-publish' && (
        <p className="text-slate mt-3 text-sm leading-relaxed">
          Nothing is published in this group, so there is nothing to paste. Publish an answer on the
          Answers page and the code appears here.
        </p>
      )}

      {state === 'stale' && (
        <p className="text-slate mt-3 text-sm leading-relaxed">
          These answers have changed since you last pasted them{' '}
          {group.publishedAt ? timeAgo(group.publishedAt) : ''}. Until you replace the block on that
          page, the engines are still reading the old version.
        </p>
      )}

      {state === 'never' && (
        <p className="text-slate mt-3 text-sm leading-relaxed">
          None of this counts until the HTML is actually on the page. Paste both blocks, then tell
          us it&rsquo;s live so we can start watching for citations.
        </p>
      )}

      {state === 'current' && (
        <p className="text-slate mt-3 text-sm leading-relaxed">
          Live copy matches what&rsquo;s here. Last pasted {timeAgo(group.publishedAt)}.
        </p>
      )}

      {html && (
        <>
          <CopyBlock
            title="The answers"
            description="Paste this into the page where the answers should appear. Plain semantic HTML — it picks up your site's own styling."
            code={html}
            language="HTML"
          />
          <CopyBlock
            title="The schema"
            description="Paste this on the same page, anywhere. It tells a machine which text is a question, which is the answer, and which business they belong to."
            code={schema}
            language="JSON-LD"
          />
        </>
      )}
    </Card>
    </div>
  );
}

export function PublishWorkspace() {
  const { site, groups, faqsIn } = useDashboard();

  if (!site) {
    return (
      <>
        <PageHeader title="Publish" description="The HTML that goes on your own site." />
        <EmptyState
          title="Add a site first"
          body="The export is built per page, from that page's published answers."
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
          body="Clean HTML with your answers in it, the schema that identifies your business to a machine, and an llms.txt — built per page and pasted onto your own domain, so the citation goes to you."
        />
      </>
    );
  }

  const llms = buildLlmsTxt(site, groups, faqsIn);
  const stale = groups.filter((g) => publishState(g, faqsIn(g.id)) === 'stale').length;

  return (
    <>
      <PageHeader
        title="Publish"
        description={`Paste each group onto its page on ${site.domain}. No plugin, no script — this is plain HTML, because AI crawlers don't run JavaScript.`}
        action={
          stale > 0 ? (
            <Badge tone="neutral">
              {stale} {stale === 1 ? 'page needs' : 'pages need'} re-pasting
            </Badge>
          ) : null
        }
      />

      <div className="space-y-5">
        {groups.length === 0 ? (
          <EmptyState
            title="No groups yet"
            body="A group is one page's worth of answers. Add one on the Answers page and its code appears here."
            action={<ButtonLink href="/dashboard/faqs">Go to Answers</ButtonLink>}
          />
        ) : (
          groups.map((group) => <GroupSection key={group.id} site={site} group={group} />)
        )}

        {/* Site-wide, not per group: there is only one /llms.txt at a domain,
            so it lists every group under its own heading. */}
        {groups.length > 0 && (
          <Card className="p-5 sm:p-7">
            <h2 className="text-lg">llms.txt</h2>
            <p className="text-slate mt-1 text-sm leading-relaxed">
              One file for the whole site, covering every group. Save it as{' '}
              <code className="text-navy font-mono text-xs">llms.txt</code> at the root of{' '}
              {site.domain}. It&rsquo;s a convention rather than a standard, and it costs one file
              to follow.
            </p>
            <CopyBlock
              title="The file"
              description="Everything published across your groups, in plain text."
              code={llms}
              language="Plain text · /llms.txt"
            />
          </Card>
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
