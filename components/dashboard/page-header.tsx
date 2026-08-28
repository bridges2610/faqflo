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
  centered = false,
}: {
  title: string;
  description?: string;
  /** Primary action for the page, right-aligned on wide screens. */
  action?: ReactNode;
  /**
   * Centre the title block.
   *
   * ⚠️ ONE PAGE USES THIS, AND IT SHOULD STAY THAT WAY. Left-aligned is the
   * dashboard's rhythm: every working screen starts at the same x, so the eye
   * lands in the same place on every navigation. /dashboard/plan is the
   * exception because it is not a working screen — it is a pricing page, and a
   * centred masthead over centred cards is what that reads as. Centring a
   * second screen would just make the alignment look accidental on both.
   *
   * Incompatible with `action` by design: a centred title with a right-aligned
   * button is neither one layout nor the other.
   */
  centered?: boolean;
}) {
  if (centered) {
    return (
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <h1 className="text-[1.75rem] sm:text-[2rem]">{title}</h1>
        {description && (
          <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{description}</p>
        )}
      </div>
    );
  }

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
