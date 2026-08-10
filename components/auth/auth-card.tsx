import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Wordmark } from '@/components/ui/wordmark';

/*
  The shell every auth screen sits in.

  Shared rather than repeated because these five pages differ only in their
  fields, and a sign-in that is four pixels off from the sign-up next to it
  reads as a different site — which is exactly the wrong feeling on the two
  screens where someone is deciding whether to trust you with a password.
*/

/**
 * The input class string, lifted verbatim from components/dashboard/site-form.tsx.
 *
 * Shared here rather than pasted a ninth time. `outline-none` is safe only
 * because globals.css puts a 3px outline back on :focus-visible globally —
 * don't copy it anywhere that rule doesn't reach.
 */
export const FIELD =
  'border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150';

/** The uppercase mono micro-label used above every field in the app. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
      {children}
    </span>
  );
}

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  /** The "already have an account?" line beneath the card. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 flex justify-center">
        <Wordmark />
      </div>

      <Card className="p-6 sm:p-8">
        <h1 className="text-[1.5rem] sm:text-[1.75rem]">{title}</h1>
        {intro && <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{intro}</p>}
        <div className="mt-6">{children}</div>
      </Card>

      {footer && <p className="text-slate mt-6 text-center text-sm">{footer}</p>}
    </div>
  );
}

/** The text link used inside auth copy — the app has no base <a> rule. */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary hover:text-primary-hover font-semibold">
      {children}
    </Link>
  );
}

/** "or" with a rule either side, between the Google button and the form. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <span className="bg-line h-px flex-1" />
      <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">or</span>
      <span className="bg-line h-px flex-1" />
    </div>
  );
}
