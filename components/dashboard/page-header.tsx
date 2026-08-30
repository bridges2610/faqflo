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
  className = 'mb-8',
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
  /**
   * Spacing from the caller. LAYOUT ONLY — never colours, never type.
   *
   * ⚠️ IT REPLACES mb-8 RATHER THAN BEING APPENDED TO IT, AND THAT IS THE
   * WHOLE REASON IT IS DEFAULTED HERE INSTEAD OF CONCATENATED BELOW. Written
   * as `mb-8 ${className}` with a caller passing `mb-4`, both utilities set
   * margin-bottom and Tailwind resolves the conflict by their order in the
   * generated stylesheet, not their order in the class attribute — so the
   * override is a coin-flip. It lost. button.tsx states the same trap for its
   * `light` variant and nav-account-link.tsx for its width. Defaulting the
   * whole token means there is only ever one margin utility in the string.
   *
   * Results is the one caller that overrides it: it follows the title with a
   * "How we check" toggle and, on a site with no country set, a line about
   * that, so the reader crosses three gaps before reaching a number.
   */
  className?: string;
}) {
  if (centered) {
    return (
      <div className={`mx-auto max-w-2xl text-center ${className}`}>
        <h1 className="text-[1.75rem] sm:text-[2rem]">{title}</h1>
        {description && (
          <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{description}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}>
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
