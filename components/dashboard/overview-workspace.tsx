'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { canTrack, hasGetCited } from '@/lib/dashboard/plans';
import { publishState } from '@/lib/dashboard/export';
import { timeAgo } from '@/lib/dashboard/format';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { StatTile } from './stat-tile';

/*
  The landing screen.

  Its job is to answer "what should I do next?" in one look, and the loop gives
  that a natural order: nothing to publish until answers exist, nothing to track
  until the export is live, and a stale live copy beats everything because it
  silently undoes work already paid for.
*/

type NextAction = { title: string; body: string; href: string; cta: string } | null;

export function OverviewWorkspace() {
  const { site, sites, groups, faqs, faqsIn, questions, tracking, data, user, seedDemoData } =
    useDashboard();

  if (!site || !data) {
    return (
      <>
        <PageHeader title="Dashboard" description="Your sites, your answers, and who is citing them." />
        <EmptyState
          title="Nothing set up yet"
          body="Add a site and FaqFlo has something to audit, answer for, and track."
          action={<ButtonLink href="/dashboard/sites">Add a site</ButtonLink>}
        />
      </>
    );
  }

  const published = faqs.filter((f) => f.status === 'published');
  const drafts = faqs.filter((f) => f.status === 'draft');
  const emptyDrafts = drafts.filter((f) => !f.answer.trim());

  /* Publishing is per page now, so the site's state is the aggregate: stale if
     any group has drifted, never if nothing has been pasted at all, current
     only when every group holding published answers is up to date. */
  const groupStates = groups.map((g) => publishState(g, faqsIn(g.id)));
  const staleGroups = groupStates.filter((s) => s === 'stale').length;
  const neverGroups = groupStates.filter((s) => s === 'never').length;
  const liveGroups = groupStates.filter((s) => s === 'current').length;
  const state: 'stale' | 'never' | 'current' | 'nothing-to-publish' =
    staleGroups > 0
      ? 'stale'
      : liveGroups > 0
        ? 'current'
        : neverGroups > 0
          ? 'never'
          : 'nothing-to-publish';

  const uncovered = questions.filter((q) => !q.covered);
  const cited = tracking?.latest.filter((c) => c.outcome === 'cited').length ?? 0;
  const checks = tracking?.latest.length ?? 0;
  const setUp = hasGetCited(site);

  const nextAction = ((): NextAction => {
    if (!setUp) {
      return {
        title: 'Set this site up',
        body: 'The technical checks are free. Get Cited adds the full audit, the questions people actually ask, and the export that puts your answers where a crawler can read them.',
        href: '/dashboard/audit',
        cta: 'See the audit',
      };
    }
    if (state === 'stale') {
      return {
        title: `${staleGroups} ${staleGroups === 1 ? 'page is' : 'pages are'} out of date`,
        body: 'Answers have changed since those pages were last pasted. Until you paste the update, the engines are still reading the old version.',
        href: '/dashboard/publish',
        cta: 'Get the updated blocks',
      };
    }
    if (published.length === 0) {
      return {
        title: 'Publish your first answers',
        body: 'Nothing reaches an engine until an answer is published and pasted onto your site.',
        href: '/dashboard/faqs',
        cta: 'Write answers',
      };
    }
    if (state === 'never') {
      return {
        title: 'Paste the export onto your pages',
        body: 'Your answers exist here but not on your domain. Until they are on the page, there is nothing for a crawler to find or quote.',
        href: '/dashboard/publish',
        cta: 'Get the HTML',
      };
    }
    if (emptyDrafts.length > 0) {
      return {
        title: `${emptyDrafts.length} ${emptyDrafts.length === 1 ? 'question is' : 'questions are'} waiting for an answer`,
        body: 'These came from what people ask AI, and they have no answer written yet. They do nothing until you write one.',
        href: '/dashboard/faqs',
        cta: 'Write the answers',
      };
    }
    if (uncovered.length > 0) {
      return {
        title: `${uncovered.length} questions you don't answer yet`,
        body: 'People are putting these to assistants about your category, and your site has nothing to say about them.',
        href: '/dashboard/questions',
        cta: 'See the questions',
      };
    }
    if (!canTrack(user)) {
      return {
        title: 'Find out whether it worked',
        body: 'Your answers are live. Tracking asks the engines your questions on a schedule and tells you who they name.',
        href: '/dashboard/tracking',
        cta: 'About tracking',
      };
    }
    return null;
  })();

  return (
    <>
      <PageHeader
        title={`Hello, ${data.user.name.split(' ')[0]}`}
        description={`${site.name} · ${site.domain}`}
        action={
          <Badge tone={state === 'current' ? 'success' : 'neutral'}>
            {state === 'current'
              ? `${liveGroups} ${liveGroups === 1 ? 'page' : 'pages'} live and current`
              : state === 'stale'
                ? `${staleGroups} ${staleGroups === 1 ? 'page' : 'pages'} out of date`
                : 'Not on your site yet'}
          </Badge>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Visibility score"
            value={site.lastAudit ? site.lastAudit.score : '—'}
            hint={site.lastAudit ? `checked ${timeAgo(site.lastAudit.checkedAt)}` : 'not audited yet'}
          />
          <StatTile
            label="Published answers"
            value={published.length}
            hint={drafts.length > 0 ? `${drafts.length} in drafts` : 'nothing waiting'}
          />
          <StatTile
            label="Cited"
            value={canTrack(user) ? cited : '—'}
            hint={canTrack(user) ? `of ${checks} checks` : 'needs Stay Cited'}
          />
          <StatTile
            label="Unanswered questions"
            value={setUp ? uncovered.length : '—'}
            hint={setUp ? 'people ask these' : 'needs Get Cited'}
          />
        </div>

        {nextAction && (
          <Card className="border-primary p-5 sm:p-7">
            <p className="text-primary font-mono text-xs tracking-wide uppercase">Do this next</p>
            <h2 className="mt-3 text-lg">{nextAction.title}</h2>
            <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{nextAction.body}</p>
            <ButtonLink href={nextAction.href} className="mt-5">
              {nextAction.cta}
            </ButtonLink>
          </Card>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-7">
            <h2 className="text-lg">The loop</h2>
            <p className="text-slate mt-1 text-sm">Where this site is in it.</p>

            <ul className="divide-line mt-4 divide-y">
              {[
                {
                  step: 'Audit',
                  done: Boolean(site.lastAudit),
                  detail: site.lastAudit
                    ? `Scored ${site.lastAudit.score}, ${timeAgo(site.lastAudit.checkedAt)}`
                    : 'Not run yet',
                  href: '/dashboard/audit',
                },
                {
                  step: 'Questions',
                  done: questions.length > 0,
                  detail: questions.length
                    ? `${questions.length} found, ${uncovered.length} unanswered`
                    : 'Nothing discovered yet',
                  href: '/dashboard/questions',
                },
                {
                  step: 'Answers',
                  done: published.length > 0,
                  detail: `${published.length} published across ${groups.length} ${
                    groups.length === 1 ? 'group' : 'groups'
                  }, ${drafts.length} draft`,
                  href: '/dashboard/faqs',
                },
                {
                  step: 'Publish',
                  done: state === 'current',
                  detail:
                    state === 'current'
                      ? `${liveGroups} of ${groups.length} ${groups.length === 1 ? 'page' : 'pages'} live`
                      : state === 'stale'
                        ? `${staleGroups} ${staleGroups === 1 ? 'page needs' : 'pages need'} re-pasting`
                        : 'Not pasted yet',
                  href: '/dashboard/publish',
                },
                {
                  step: 'Track',
                  done: canTrack(user) && checks > 0,
                  detail: canTrack(user)
                    ? `${cited} citations across ${checks} checks`
                    : 'Needs Stay Cited',
                  href: '/dashboard/tracking',
                },
              ].map((row) => (
                <li key={row.step} className="flex items-center gap-3 py-3">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold ${
                      row.done ? 'bg-success/12 text-success-ink' : 'bg-cloud text-slate'
                    }`}
                    aria-hidden="true"
                  >
                    {row.done ? '✓' : '·'}
                  </span>
                  <Link href={row.href} className="min-w-0 flex-1">
                    <span className="text-navy block text-sm font-semibold">{row.step}</span>
                    <span className="text-slate block text-xs">{row.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-lg">Recently updated</h2>
            {faqs.length === 0 ? (
              <p className="text-slate mt-3 text-sm">Nothing yet.</p>
            ) : (
              <ul className="divide-line mt-3 divide-y">
                {[...faqs]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .slice(0, 5)
                  .map((faq) => (
                    <li key={faq.id} className="flex items-start gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="text-navy block truncate text-sm">{faq.question}</span>
                        <span className="text-slate mt-0.5 block text-xs">
                          {timeAgo(faq.updatedAt)}
                        </span>
                      </span>
                      <Badge tone={faq.status === 'published' ? 'success' : 'neutral'}>
                        {faq.status === 'published' ? 'Published' : 'Draft'}
                      </Badge>
                    </li>
                  ))}
              </ul>
            )}
            <Link
              href="/dashboard/faqs"
              className="text-primary hover:text-primary-hover mt-4 inline-block text-sm font-semibold"
            >
              Manage answers →
            </Link>
          </Card>
        </div>

        <Card tone="cloud" className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-slate text-sm">
            {sites.length} {sites.length === 1 ? 'site' : 'sites'} on this account. Your answers,
            questions and tracking are stored in this browser for now.
          </p>
          {/* Development affordance: fills the local half with the demo
              fixture so the populated screens can be seen. It can no longer
              grant an entitlement or invent a site — both are rows. */}
          {process.env.NODE_ENV === 'development' && (
            <Button size="sm" variant="ghost" onClick={seedDemoData}>
              Fill with demo data
            </Button>
          )}
        </Card>
      </div>
    </>
  );
}
