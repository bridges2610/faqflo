'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { useDashboard } from '@/lib/dashboard/provider';
import { canAddSite, SITE_CAP } from '@/lib/dashboard/plans';
import { publishState } from '@/lib/dashboard/export';
import { timeAgo } from '@/lib/dashboard/format';
import { BusinessProfile } from './business-profile';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { PlusIcon, TrashIcon } from './nav-icons';
import { SiteForm } from './site-form';
import { SearchCountry, countryLabel } from './search-country';
import { SectionTitle } from './section-title';

/*
  Sites.

  ⚠️ THE PLAN IS NO LONGER PER SITE, WHICH INVERTS WHAT THIS PAGE IS FOR. It
  used to show which of an account's sites had been paid for, and adding one was
  never blocked because the money was per site and a cap would only cost us
  customers. Pro covers the account, so every extra site is a full crawl and 75
  more engine calls a week against one subscription — the cap is now the thing
  this page has to enforce. See SITE_CAP.

  This is also where a site's industry and service area are edited. They belong
  here rather than on Content, which is where the only editor used to live: they
  describe the business, they are read by the content plan AND by question
  discovery, and Content's copy of the editor was unreachable until a plan had
  been generated — so a customer could see "Industry: unknown" on the dashboard
  with nowhere in the product to go and fix it.
*/
function SiteRow({ id }: { id: string }) {
  const { sites, site, selectSite, removeSite, renameSite, data } = useDashboard();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  const row = sites.find((s) => s.id === id);
  if (!row || !data) return null;

  const isCurrent = site?.id === row.id;

  // Answers hang off groups now, so a site's totals are gathered across them.
  const siteGroups = data.groups.filter((g) => g.siteId === row.id);
  const groupIds = new Set(siteGroups.map((g) => g.id));
  const siteFaqs = data.faqs.filter((f) => groupIds.has(f.groupId));
  const published = siteFaqs.filter((f) => f.status === 'published').length;

  // Publishing is per page, so a site is only "current" when every group that
  // has something to publish has been pasted with its latest content.
  const groupStates = siteGroups.map((g) =>
    publishState(
      g,
      siteFaqs.filter((f) => f.groupId === g.id),
    ),
  );
  const staleCount = groupStates.filter((s) => s === 'stale').length;
  const liveCount = groupStates.filter((s) => s === 'current').length;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-navy font-semibold">{row.name}</span>
          {isCurrent && <Badge tone="blue">Selected</Badge>}
          {/* ⚠️ NO PLAN BADGE PER SITE. Get Cited was bought per site, so a row
              genuinely needed to say which of them was paid for. The plan is on
              the account now — PlanBadge in the sidebar says it once. Repeating
              it on every row would imply sites can differ, which they cannot. */}
          {staleCount > 0 && (
            <Badge tone="neutral">
              {staleCount} {staleCount === 1 ? 'page' : 'pages'} out of date
            </Badge>
          )}
          {staleCount === 0 && liveCount > 0 && <Badge tone="success">Published</Badge>}
        </div>
        <p className="text-slate mt-1 text-sm">
          {/* The name above is already the domain for most customers, who type
              it into the name field. Repeating it here read as a stutter. */}
          {!isNamedAfterDomain(row.name, row.domain) && (
            <>
              <span className="font-mono text-xs">{row.domain}</span> ·{' '}
            </>
          )}
          {siteGroups.length} {siteGroups.length === 1 ? 'group' : 'groups'} · {published}{' '}
          published · added {timeAgo(row.createdAt)}
        </p>

        {/* Shown even when unset, so the gap is visible next to the button that
            fixes it. These two fields feed the content plan and question
            discovery, and a blank pair makes both generic. */}
        <p className="text-slate mt-1 text-sm">
          {row.industry ? (
            <span className="text-navy font-medium">{row.industry}</span>
          ) : (
            'Industry not set'
          )}
          {row.location ? <> · {row.location}</> : null}
          {/* Where checks are asked FROM, which is not the same as the service
              area above and is easy to mistake for it — hence the verb. */}
          {row.country ? <> · asked from {countryLabel(row.country)}</> : null}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* The grant/revoke buttons that used to sit here are gone. The plan is
            a column the browser has no UPDATE grant on, so the control could
            only ever have failed silently. Buying it is the Stripe stage; to
            exercise Pro in development, set profiles.plan in the SQL editor. */}
        {!isCurrent && (
          <button
            onClick={() => selectSite(row.id)}
            className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
          >
            Select
          </button>
        )}

        <button
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
        >
          {editing ? 'Close' : 'Edit'}
        </button>

        {confirming ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-slate">Delete site and its answers?</span>
            <button onClick={() => removeSite(row.id)} className="text-error-ink font-semibold">
              Yes
            </button>
            <button onClick={() => setConfirming(false)} className="text-slate">
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${row.name}`}
            className="text-slate hover:text-error-ink transition-colors duration-150"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Full-width, so it wraps onto its own line inside the row's flex.
          Opened straight into the form — the button above was the affordance,
          and making someone click "Edit" twice would be silly.

          ⚠️ 'manual' is the point of this control, not a detail: it is what
          tells a later audit or content plan to leave these values alone. See
          the guards in audit-workspace.tsx and content-workspace.tsx. */}
      {editing && (
        <div className="w-full">
          <BusinessProfile
            key={row.id}
            defaultEditing
            onDone={() => setEditing(false)}
            industry={row.industry}
            location={row.location}
            source={row.profileSource}
            onSave={async (industry, location) => {
              await renameSite(row.id, { industry, location, profileSource: 'manual' });
            }}
          />

          {/* Separate from the profile above on purpose. Industry and service
              area describe the business; this changes what the answer engines
              are shown when we ask. Folding it into BusinessProfile would also
              have meant changing an onSave signature two pages share. */}
          <div className="border-line mt-5 border-t pt-5">
            <SearchCountry siteId={row.id} country={row.country} />
          </div>
        </div>
      )}
    </li>
  );
}

export function SitesWorkspace() {
  const { sites } = useDashboard();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader
        title="Sites"
        description={
          SITE_CAP === 1
            ? 'The website we check for you. Change it here if you need to.'
            : `Up to ${SITE_CAP} websites on your account — each is checked on its own.`
        }
      />

      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SectionTitle>Your sites</SectionTitle>
            <Badge tone="neutral">{sites.length}</Badge>
          </div>
          {/* ⚠️ HIDDEN AT THE CAP RATHER THAN DISABLED. A disabled button with
              no reason beside it reads as a bug; the sentence below says what
              the limit is. store.createSite() refuses past it as well, and
              /api/onboarding/start refuses server-side — this is only the part
              that stops somebody trying. */}
          {canAddSite(sites.length) && (
            <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
              <PlusIcon className="h-4 w-4" />
              Add site
            </Button>
          )}
        </div>

        {adding && (
          <div className="mt-4">
            <SiteForm onDone={() => setAdding(false)} />
          </div>
        )}

        {!canAddSite(sites.length) && (
          <p className="text-slate mt-3 text-xs leading-relaxed">
            {SITE_CAP === 1
              ? 'One website per account. To check a different one, remove this and add it.'
              : `That's all ${SITE_CAP} websites on your account.`}
          </p>
        )}

        {sites.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="No sites yet"
              body="Add the site you want cited. Everything else — the audit, the questions, the export — hangs off it."
              action={<Button onClick={() => setAdding(true)}>Add your first site</Button>}
            />
          </div>
        ) : (
          <ul className="divide-line mt-2 divide-y">
            {sites.map((s) => (
              <SiteRow key={s.id} id={s.id} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
