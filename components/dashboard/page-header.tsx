import type { ReactNode } from 'react';

/**
 * Title block for a dashboard page.
 *
 * Every page uses it, so the vertical rhythm below the header is identical
 * everywhere and pages don't drift apart one margin at a time.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  /** Primary action for the page, right-aligned on wide screens. */
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-[1.75rem] sm:text-[2rem]">{title}</h1>
        {description && (
          <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
