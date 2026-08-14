'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { useDashboard } from '@/lib/dashboard/provider';
import { hasGetCited } from '@/lib/dashboard/plans';
import { publishState } from '@/lib/dashboard/export';
import { timeAgo } from '@/lib/dashboard/format';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { PlusIcon, TrashIcon } from './nav-icons';
import { SiteForm } from './site-form';
import { SectionTitle } from './section-title';

/*
  Sites.

  Get Cited is bought per site, so this is where that fact is visible: each row
  says whether this particular site is set up, and adding a site is never
  blocked — the money is per site, so a cap would only cost us customers.
*/
function SiteRow({ id }: { id: string }) {
  const { sites, site, selectSite, removeSite, data } = useDashboard();
  const [confirming, setConfirming] = useState(false);

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
  const setUp = hasGetCited(row);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-navy font-semibold">{row.name}</span>
          {isCurrent && <Badge tone="blue">Selected</Badge>}
          {setUp ? <Badge tone="cyan">Get Cited</Badge> : <Badge tone="neutral">Free</Badge>}
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
      </div>

      <div className="flex items-center gap-3">
        {/* The grant/revoke buttons that used to sit here are gone. Get Cited
            is a column the browser has no UPDATE grant on, so the control
            could only ever have failed silently. Buying it is the Stripe
            stage; until then, set get_cited_at in the SQL editor. */}
        {!isCurrent && (
          <button
            onClick={() => selectSite(row.id)}
            className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
          >
            Select
          </button>
        )}

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
        description="Each site is set up on its own — Get Cited is bought per site, and answers never cross between them."
      />

      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SectionTitle>Your sites</SectionTitle>
            <Badge tone="neutral">{sites.length}</Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
            <PlusIcon className="h-4 w-4" />
            Add site
          </Button>
        </div>

        {adding && (
          <div className="mt-4">
            <SiteForm onDone={() => setAdding(false)} />
          </div>
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
