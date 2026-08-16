'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buildPasteBlock } from '@/lib/dashboard/export';
import { useDashboard } from '@/lib/dashboard/provider';
import { canPublish } from '@/lib/dashboard/plans';
import { useCopy } from '@/lib/dashboard/use-copy';
import type { FaqEntry, FaqGroup } from '@/lib/dashboard/types';
import { CopyIcon, LockIcon, TickIcon } from './nav-icons';

/**
 * Copy this group's answer HTML without leaving the page — or opening the group.
 *
 * ⚠️ ENTITLEMENT: the export is most of what Get Cited sells, and Publish is
 * gated on it. A copy button here that handed over the same HTML would be a
 * hole straight through that gate, so this one checks the same capability and
 * turns into a link to Publish — where the existing UpgradeCard already
 * explains the tier — when the site hasn't got it.
 */
export function CopyHtmlButton({ group, faqs }: { group: FaqGroup; faqs: FaqEntry[] }) {
  const { site } = useDashboard();
  const { copied, copy } = useCopy();

  // The same block Publish hands over, schema included. Copying only the HTML
  // here would make this the one route to a half-paste that still lets the
  // group be marked published.
  const html = site ? buildPasteBlock(site, group, faqs) : '';
  const allowed = canPublish(site);

  if (!allowed) {
    return (
      <Link
        href="/dashboard/publish"
        aria-label={`Copying the code for ${group.name} needs Get Cited`}
        title="Get Cited unlocks the export for this site"
        className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1.5 transition-colors duration-150"
      >
        <LockIcon className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button
      onClick={() => copy(html)}
      disabled={!html}
      aria-label={
        !html
          ? `Nothing published in ${group.name} to copy`
          : copied
            ? `Code for ${group.name} copied`
            : `Copy the code for ${group.name}`
      }
      title={!html ? 'Publish an answer first' : 'Copy the answers and schema'}
      className={`rounded-md p-1.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
        copied ? 'text-success-ink' : 'text-slate hover:text-primary hover:bg-cloud'
      }`}
    >
      {copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
    </button>
  );
}
