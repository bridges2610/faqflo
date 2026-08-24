'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buildPasteBlock, buildPlainText } from '@/lib/dashboard/export';
import { useDashboard } from '@/lib/dashboard/provider';
import { canPublish } from '@/lib/dashboard/plans';
import { useCopy } from '@/lib/dashboard/use-copy';
import type { FaqEntry, FaqGroup } from '@/lib/dashboard/types';
import { CopyIcon, LockIcon, TickIcon } from './nav-icons';

/**
 * Copy this group's answer HTML without leaving the page — or opening the group.
 *
 * ⚠️ ENTITLEMENT: the ready-to-paste code is most of what Pro sells, and Publish
 * is gated on it. A copy button here that handed over the same HTML would be a
 * hole straight through that gate, so this one checks the same capability and
 * turns into a link to Publish — where the existing UpgradeCard already
 * explains the plan — when the account hasn't got it.
 *
 * ⚠️ Free is not left with nothing: CopyPlainButton beside this one hands over
 * the same answers as plain text, which is the "your words are yours" half of
 * what the pricing page promises. What Pro buys is the HTML and the schema.
 */
export function CopyHtmlButton({ group, faqs }: { group: FaqGroup; faqs: FaqEntry[] }) {
  const { site, user } = useDashboard();
  const { copied, copy } = useCopy();

  // The same block Publish hands over, schema included. Copying only the HTML
  // here would make this the one route to a half-paste that still lets the
  // group be marked published.
  const html = site ? buildPasteBlock(site, group, faqs) : '';
  const allowed = canPublish(user);

  if (!allowed) {
    return (
      <Link
        href="/dashboard/publish"
        aria-label={`Copying the code for ${group.name} needs Pro`}
        title="Pro unlocks the ready-to-paste code"
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

/**
 * Copy this group's answers as plain text. NEVER GATED, ON ANY PLAN.
 *
 * ⚠️ THE COUNTERWEIGHT TO CopyHtmlButton ABOVE, AND IT MUST STAY UNGATED. When
 * publishing became a subscription feature, the honest version of "your words
 * are yours" stopped being the export and became this. The pricing page says so
 * in as many words; a lock here would make that a lie on the screen that sold
 * the plan.
 *
 * Includes drafts — see the note on buildPlainText(). Somebody taking their
 * writing with them wants the unfinished ones too.
 */
export function CopyPlainButton({ group, faqs }: { group: FaqGroup; faqs: FaqEntry[] }) {
  const { copied, copy } = useCopy();

  const text = buildPlainText(group, faqs);
  // Two lines is the heading plus a blank — nothing was written yet.
  const empty = text.trim().split('\n').length <= 1;

  return (
    <button
      onClick={() => copy(text)}
      disabled={empty}
      aria-label={
        empty
          ? `Nothing written in ${group.name} to copy`
          : copied
            ? `${group.name} copied as text`
            : `Copy ${group.name} as plain text`
      }
      title={empty ? 'Write an answer first' : 'Copy the questions and answers as plain text'}
      className={`rounded-md p-1.5 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
        copied ? 'text-success-ink' : 'text-slate hover:text-primary hover:bg-cloud'
      }`}
    >
      {copied ? 'Copied' : 'TXT'}
    </button>
  );
}
