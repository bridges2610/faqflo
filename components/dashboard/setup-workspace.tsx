'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { canAddSite } from '@/lib/dashboard/plans';
import { timeAgo } from '@/lib/dashboard/format';
import { EmbedSnippet } from './embed-snippet';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { PlusIcon, TrashIcon } from './nav-icons';
import { SiteForm } from './site-form';
import { UpgradeCard } from './upgrade-card';

/** One row in the sites list. Selecting it changes what the rest of the app shows. */
function SiteRow({ id }: { id: string }) {
  const { sites, site, selectSite, removeSite, data } = useDashboard();
  const [confirming, setConfirming] = useState(false);

  const row = sites.find((s) => s.id === id);
  if (!row || !data) return null;

  const isCurrent = site?.id === row.id;
  // Counted from the full snapshot rather than the context's `faqs`, which is
  // scoped to the selected site — and this row may not be it.
  const count = data.faqs.filter((f) => f.siteId === row.id).length;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-navy font-semibold">{row.name}</span>
          {isCurrent && <Badge tone="blue">Selected</Badge>}
          <Badge tone={row.installedAt ? 'success' : 'neutral'}>
            {row.installedAt ? 'Installed' : 'Not detected'}
          </Badge>
        </div>
        <p className="text-slate mt-1 text-sm">
          <span className="font-mono text-xs">{row.domain}</span> · {count}{' '}
          {count === 1 ? 'FAQ' : 'FAQs'} · added {timeAgo(row.createdAt)}
        </p>
      </div>

      <div className="flex items-center gap-3">
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
            <span className="text-slate">Delete site and its FAQs?</span>
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

export function SetupWorkspace() {
  const { sites, site, plan, limits } = useDashboard();
  const [adding, setAdding] = useState(false);

  const roomForMore = canAddSite(plan, sites.length);

  return (
    <>
      <PageHeader
        title="Setup"
        description="Your sites and the one line of code that puts your answers on them."
      />

      <div className="space-y-5">
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg">Sites</h2>
              <Badge tone="neutral">
                {sites.length} of {limits.sites}
              </Badge>
            </div>

            <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
              <PlusIcon className="h-4 w-4" />
              Add site
            </Button>
          </div>

          {/* The control is never disabled without saying why — at the limit it
              opens the explanation instead of the form. */}
          {adding &&
            (roomForMore ? (
              <div className="mt-4">
                <SiteForm onDone={() => setAdding(false)} />
              </div>
            ) : (
              <div className="mt-4">
                <UpgradeCard
                  compact
                  title={`${limits.label} covers ${limits.sites} ${
                    limits.sites === 1 ? 'site' : 'sites'
                  }`}
                  body="You're using everything this plan includes. The next tier up adds room for more sites, with separate FAQs and analytics for each."
                />
              </div>
            ))}

          {sites.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No sites yet"
                body="Add the site you want FAQs on. You'll get a snippet to paste, and everything else follows from there."
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

        {site && <EmbedSnippet site={site} />}
      </div>
    </>
  );
}
