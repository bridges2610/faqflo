'use client';

import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { useCopy } from '@/lib/dashboard/use-copy';
import type { Task } from '@/lib/dashboard/worklist';
import { CopyIcon, LockIcon, TickIcon } from './nav-icons';

/*
  One job, wherever it is shown.

  This markup used to live inside audit-workspace.tsx as a local ActionRow, and
  the Overview had its own, different, single-action card. The two disagreed
  about wording, ordering and how many things to show, which meant the answer to
  "what should I do next?" depended on which screen you happened to be on. Now
  both render this, from one ranked list.

  The action is the point of the row. A copy-kind task hands over the exact
  snippet rather than describing it, because the fix lives on the customer's own
  site and a description is a thing they then have to translate.
*/
export function TaskRow({ task, index }: { task: Task; index: number }) {
  const { copied, copy } = useCopy();

  return (
    <li className="flex gap-4 py-4">
      <span
        className={`font-display mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
          task.locked ? 'bg-cloud text-slate border-line border' : 'bg-primary-soft text-primary'
        }`}
      >
        {task.locked ? <LockIcon className="h-3.5 w-3.5" /> : index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-navy text-[0.9375rem] leading-snug font-semibold">{task.what}</h3>
          {/* Real points, from scoreIfFixed — never a guess. A task that cannot
              move the score says nothing rather than inventing a number. */}
          {task.impact !== null && <Badge tone="success">+{task.impact} points</Badge>}
          {!task.locked && <span className="text-slate text-xs">{task.effort}</span>}
        </div>
        <p className="text-slate mt-1 text-sm leading-relaxed">{task.why}</p>

        {task.action.kind === 'link' && (
          <ButtonLink
            href={task.action.href}
            size="sm"
            variant={task.locked ? 'primary' : 'ghost'}
            className="mt-3"
          >
            {task.action.label}
          </ButtonLink>
        )}

        {task.action.kind === 'copy' && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copy(task.action.kind === 'copy' ? task.action.snippet : '')}
              >
                {copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                {copied ? 'Copied' : task.action.label}
              </Button>
              <span className="text-slate text-xs">{task.action.where}</span>
            </div>
            <pre className="bg-ink mt-2 max-h-32 overflow-auto rounded-lg p-3">
              <code className="font-mono text-[0.6875rem] leading-relaxed whitespace-pre text-white/90">
                {task.action.snippet}
              </code>
            </pre>
          </div>
        )}
      </div>
    </li>
  );
}
