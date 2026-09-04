import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'dark' | 'light';
type Size = 'sm' | 'md' | 'lg';
type Shape = 'soft' | 'pill';

/*
  ⚠️ `active:` IS WHAT A PHONE ACTUALLY SEES, AND IT WAS MISSING.

  Every visual response this component had was a `hover:` utility, and Tailwind
  v4 compiles those inside `@media (hover: hover)` — so a touch device matched
  none of them and a press did nothing until the page moved. The scale is
  deliberately small: 0.97 reads as a button taking a press, 0.9 reads as a toy.

  `active:duration-75` rather than one duration for both states: 200ms is right
  for a pointer drifting onto a button and far too slow for a finger already on
  it. Press is near-instant, release eases back over the full 200ms.

  ⚠️ `disabled:active:scale-100` OR A DEAD BUTTON STILL FLINCHES. `disabled`
  drops the opacity but does not stop :active matching, so without this a button
  that refuses to do anything would still animate as though it had.
*/
const BASE =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.97] active:duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

/*
  ⚠️ `soft` IS THE DEFAULT AND `pill` IS THE OPT-IN, WHICH IS THE OPPOSITE OF
  HOW THIS COMPONENT STARTED. Read this before flipping it back.

  Every button in the product was a 999px pill, and the dashboard had become a
  screenful of them. The instruction was to use the shape sparingly, so it is
  now the exception a caller asks for rather than the rule everyone inherits —
  which is a statement in the type, not just a habit.

  The default is `soft` rather than `pill` for a second, duller reason:
  components/dashboard holds 98 Button and ButtonLink call sites and marketing
  holds nine. Defaulting to pill would have meant editing 98 files to change 98
  buttons. Defaulting to soft means nine callers say `shape="pill"`.

  ⚠️ ON PUBLIC PAGES THE SHAPE NOW DEPENDS ON WHAT THE BUTTON IS ATTACHED TO.
  This note used to read "EVERYTHING A VISITOR SEES KEEPS ITS PILLS ON PURPOSE…
  nobody has reviewed a squared-off home page", and listed start-form and
  done-for-you-form among the keepers. That review happened. The rule now:

    ATTACHED TO A FORM  → `soft`. It takes the field's radius, because every
                          field on the site is `rounded-input` and a 999px
                          button beside a 14px input reads as two design
                          languages arguing. This is the DEFAULT, so these
                          callers simply pass no `shape` at all:
                          marketing/start-form, marketing/done-for-you-form,
                          generator/faq-generator, and all five of
                          components/auth (the Google button included — it is
                          OAuth rather than a submit, but it shares a card with
                          one, and a pill beside a soft button in one card is
                          worse than either shape on its own).

    STANDALONE CTA      → `shape="pill"`. Nothing to match, and the shape is
                          what marks it as the page's action: site-nav,
                          mobile-nav, final-cta, pricing-teaser, the blog
                          index, and marketing/busy-button's floating trigger.

  ⚠️ WHY AUTH SITS WITH MARKETING RATHER THAN WITH THE DASHBOARD. /sign-up is
  the next screen after the hero's form — StartForm hands off to
  /sign-up?next=/dashboard/start?domain=… — so a soft button that turned back
  into a pill one click later would be the exact inconsistency this rule exists
  to remove.

  ⚠️ THE SIGNED-IN SURFACES TAKE THE DEFAULT, INCLUDING THE ONES THAT DO NOT
  LOOK LIKE THE DASHBOARD. app/(app)/error.tsx and the checkout return page are
  behind the login and square off with everything else.

  Adding a button to a public page? Decide by the two lines above, and nothing
  enforces that but this note — grep for `<Button` outside components/dashboard
  and check which list it belongs on.

  Badges are untouched: components/ui/badge.tsx stays rounded-pill because a
  badge reads as a tag rather than a control. Segmented toggles keep their pill
  field too — that is the one place the shape still earns its keep.
*/
const SHAPES: Record<Shape, string> = {
  soft: 'rounded-input',
  pill: 'rounded-pill',
};

const VARIANTS: Record<Variant, string> = {
  // Solid blue rather than the gradient: white text needs 4.5:1, and the
  // gradient's cyan end is far too light to carry it. The gradient is used for
  // surfaces and decoration instead.
  primary: 'bg-primary text-on-primary shadow-card hover:bg-primary-hover hover:shadow-lift',
  ghost: 'bg-surface text-navy border border-line shadow-soft hover:border-primary hover:text-primary',
  dark: 'bg-ink text-white shadow-card hover:bg-ink/90 hover:shadow-lift',
  // For dark or gradient backgrounds. Exists as its own variant because
  // overriding `primary`'s colours through className is a coin-flip — both land
  // at the same specificity and whichever Tailwind emits last wins.
  light: 'bg-white text-ink shadow-lift hover:bg-white/90',
};

/*
  ⚠️ `sm` IS TALLER ON A PHONE THAN ON A DESKTOP, AND THAT IS THE WHOLE POINT.
  It was a flat h-9 — 36px — which is the size nearly every action on the
  dashboard uses, and 36px is a poor thumb target. h-11 is 44px.

  Released at `sm:` rather than raised everywhere: adding 8px to every button at
  every width would push already-long lists further down the page on the screens
  that are hardest to scroll. Desktop keeps its density; a phone gets a target.

  md and lg were already 44px or more and need nothing.
*/
const SIZES: Record<Size, string> = {
  sm: 'h-11 sm:h-9 px-4 text-sm',
  md: 'h-11 px-6 text-[0.9375rem]',
  lg: 'h-13 px-8 text-base',
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  /** Trailing arrow that nudges right on hover. */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
};

function Inner({ children, arrow }: { children: ReactNode; arrow?: boolean }) {
  return (
    <>
      {children}
      {arrow && (
        <span
          className="transition-transform duration-200 ease-bounce group-hover:translate-x-1"
          aria-hidden="true"
        >
          →
        </span>
      )}
    </>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  shape = 'soft',
  arrow,
  className = '',
  children,
  ...rest
}: CommonProps & ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      className={`group ${BASE} ${SHAPES[shape]} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      <Inner arrow={arrow}>{children}</Inner>
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  shape = 'soft',
  arrow,
  className = '',
  children,
  ...rest
}: CommonProps & { href: string } & Omit<ComponentPropsWithoutRef<'a'>, 'href'>) {
  return (
    <Link
      href={href}
      className={`group ${BASE} ${SHAPES[shape]} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      <Inner arrow={arrow}>{children}</Inner>
    </Link>
  );
}
