'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { timeAgo } from '@/lib/dashboard/format';
import type { Site } from '@/lib/dashboard/types';

/** The one line that goes on the customer's site. */
export function embedSnippet(siteId: string): string {
  return `<script src="https://faqflo.com/embed.js" data-site="${siteId}" defer></script>`;
}

export function EmbedSnippet({ site }: { site: Site }) {
  const { markInstalled } = useDashboard();
  const [copied, setCopied] = useState(false);
  const snippet = embedSnippet(site.id);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard access can be refused (insecure context, permissions). The
      // snippet is on screen and selectable, so there's nothing to recover.
    }
  }

  const installed = site.installedAt !== null;

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg">Install the widget</h2>
        <Badge tone={installed ? 'success' : 'neutral'}>
          {installed ? `Seen ${timeAgo(site.lastSeenAt)}` : 'Not detected yet'}
        </Badge>
      </div>

      <p className="text-slate mt-2 text-sm leading-relaxed">
        Paste this just before <code className="font-mono text-xs">&lt;/body&gt;</code> on every
        page you want FAQs to appear on. Most platforms have a &ldquo;custom code&rdquo; or
        &ldquo;footer scripts&rdquo; box for exactly this.
      </p>

      {/* Navy block, monospace, scrolls horizontally rather than wrapping — a
          wrapped script tag invites someone to paste a broken line. */}
      <div className="bg-navy mt-4 overflow-x-auto rounded-xl p-4">
        <code className="font-mono text-[0.8125rem] whitespace-pre text-white/90">{snippet}</code>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          onClick={copy}
          className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
        >
          {copied ? 'Copied ✓' : 'Copy snippet'}
        </button>

        <span className="text-slate text-sm">
          Site ID <code className="text-navy font-mono text-xs">{site.id}</code>
        </span>

        {!installed && (
          // DEMO ONLY. In production the embed's first request marks a site
          // installed; nothing in the dashboard can assert it. Delete this with
          // the rest of the mock layer.
          <button
            onClick={() => markInstalled(site.id)}
            className="text-slate hover:text-navy border-line ml-auto rounded-full border px-3 py-1 text-xs transition-colors duration-150"
          >
            Simulate install (demo)
          </button>
        )}
      </div>
    </Card>
  );
}
