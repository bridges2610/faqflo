'use client';

import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { canDiscover } from '@/lib/dashboard/plans';
import { formatNumber } from '@/lib/dashboard/format';
import { DraftIntoGroup } from './draft-into-group';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { UpgradeCard } from './upgrade-card';

/*
  Discover: the questions people put to AI about this category, and whether an
  answer exists for each one.

  This is step two of the loop and the place the loop closes — an uncited
  question from Tracking lands here, and drafting an answer from it moves it
  into Generate.
*/
export function DiscoverWorkspace() {
  const { site, user, questions, faqs, coverQuestion } = useDashboard();

  if (!site) {
    return (
      <>
        <PageHeader title="Questions" description="What people ask AI about your category." />
        <EmptyState
          title="Add a site first"
          body="Questions are discovered per site, from its category and location."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  if (!canDiscover(site, user)) {
    return (
      <>
        <PageHeader title="Questions" description="What people ask AI about your category." />
        <UpgradeCard
          entitlement="get_cited"
          siteName={site.name}
          title="The questions people actually ask"
          body="Real questions put to AI assistants about your category and your area — not the ones you assume they ask. Each one becomes an answer you can publish."
        />
      </>
    );
  }

  const uncovered = questions.filter((q) => !q.covered);

  return (
    <>
      <PageHeader
        title="Questions"
        description={`What people ask AI about ${site.name}'s category. Answer the ones you're missing, and they stop being gaps.`}
      />

      <div className="space-y-5">
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg">Discovered questions</h2>
              <Badge tone="neutral">
                {questions.length - uncovered.length} of {questions.length} answered
              </Badge>
            </div>
            <p className="text-slate text-xs">
              {faqs.filter((f) => f.status === 'published').length} answers published
            </p>
          </div>

          {questions.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="Nothing discovered yet"
                body="We look at what people ask assistants about your category and your area. Check back shortly after setup."
              />
            </div>
          ) : (
            <ul className="divide-line mt-3 divide-y">
              {questions.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-navy text-sm">{q.question}</p>
                    <p className="text-slate mt-0.5 text-xs">
                      About {formatNumber(q.volume)} asks a month
                    </p>
                  </div>
                  {q.covered ? (
                    <Badge tone="success">Answered</Badge>
                  ) : (
                    <DraftIntoGroup
                      question={q.question}
                      onDrafted={() => coverQuestion(q.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {uncovered.length > 0 && (
          <Card tone="cloud" className="p-5 sm:p-7">
            <p className="text-slate font-mono text-xs tracking-wide uppercase">Where this goes</p>
            <h3 className="mt-3 text-lg">
              {uncovered.length} {uncovered.length === 1 ? 'question has' : 'questions have'} no
              answer on your site
            </h3>
            <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
              Drafting one puts it in your FAQs as an empty draft, waiting for you to write the
              answer in your own words. Publish it, paste the export, and it becomes something an
              assistant can quote.
            </p>
            <ButtonLink href="/dashboard/faqs" size="sm" className="mt-4">
              Go to FAQs
            </ButtonLink>
          </Card>
        )}
      </div>
    </>
  );
}
