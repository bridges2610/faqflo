import { Button } from '@/components/ui/button';

/*
  The one field that starts a check: a domain, handed to the onboarding route.

  ⚠️ SHARED SO THE HERO AND /free-report CANNOT DRIFT. Those two used to be
  different things — the hero created an account, /free-report ran an anonymous
  audit and offered a signup link afterwards. /free-report now does what the
  hero does, and the request was literally "the same as the form on the hero
  section", so the markup is one component rather than two copies that agree
  today. Everything below moved here from hero.tsx with its reasoning attached.

  ⚠️ THE ID IS A PROP BECAUSE TWO OF THESE CAN SHARE A DOCUMENT. The label's
  htmlFor has to match its own input; a hardcoded id would silently point both
  labels at whichever field rendered first if these ever appear on one page.

  It starts a check by handing the domain to machinery that already exists.
  /dashboard/start creates the site row and enqueues the scan
  (app/api/onboarding/start/route.ts). It is listed in SIGNUP_FIRST in proxy.ts,
  so a signed-out visitor is sent to /sign-up with the whole destination — query
  string included — in `next`, and lands back with a free account and their
  domain still attached.

  ⚠️ A PLAIN GET FORM, AND IT SHOULD STAY ONE. `method="get"` serialises the
  field into the query string and the browser navigates to
  /dashboard/start?domain=… by itself: no state, no fetch, no Server Action, and
  no 'use client' — so the hero, which every visitor loads first, still ships
  zero JavaScript. The instinct on a later edit is useState + fetch, the house
  rule for other non-auth forms (components/marketing/done-for-you-form.tsx).
  That rule is for forms which POST and render a result. This one hands a value
  to the next page, which a link with a field in it already does.

  No client-side validation of the domain either. normalizeDomain() in the
  onboarding route is what actually decides, and it accepts more shapes than a
  regex here would — a second rule here could only reject an address the server
  would have taken.
*/
export function StartForm({
  /** Unique per instance — see the note above. */
  id,
  /** Submit label. The hero and /free-report deliberately differ — see below. */
  label = 'Get Started',
  /**
   * Row width, as a Tailwind max-w-* class.
   *
   * ⚠️ A PROP, NOT SOMETHING YOU PASS THROUGH `className`. Two max-w utilities
   * on one element land at the same specificity, so the winner is whichever
   * Tailwind emits later — not whichever the class attribute lists last. That
   * exact assumption already failed once in this codebase (a `rounded-2xl`
   * passed through a className lost to the shell's `rounded-xl` and measured
   * 18px). Replacing the token is the only reliable way to change it.
   */
  width = 'max-w-md',
  className = '',
}: {
  id: string;
  label?: string;
  width?: string;
  className?: string;
}) {
  return (
    <form
      action="/dashboard/start"
      method="get"
      className={`flex ${width} flex-col gap-3 sm:flex-row ${className}`}
    >
      <label htmlFor={id} className="sr-only">
        Your website address
      </label>
      <input
        id={id}
        type="text"
        name="domain"
        inputMode="url"
        autoComplete="url"
        required
        placeholder="yourbusiness.com"
        /*
          White and lifted. This sits on the hero's `bloom` gradient, which is
          itself pale — grey-on-pale left the input looking like empty space
          with a hairline round it, beside a solid blue button that took all the
          attention. bg-white + shadow-soft is how everything else on that
          gradient holds its edge: the eyebrow pill above it uses exactly that,
          and so do the AnswerCard panels.

          ⚠️ THERE WAS A SECOND, GREYER VARIANT AND IT IS GONE WITH ITS PAGE.
          /free-report used bg-cloud because it was a white section where a
          faintly grey field read as an inset. That page is now this same form
          on the cloud background, so one treatment serves both. Do not
          reintroduce a tone prop for a surface that no longer exists.

          h-13 matches the lg Button's height (see SIZES in
          components/ui/button.tsx) so the two line up. py-3 alone left the
          field a few pixels shorter than the button next to it.

          ⚠️ sm:flex-1, NOT flex-1 — AND h-13 IS WHY. `flex-1` is `flex: 1 1 0%`,
          and below sm this form is flex-col, so that basis of 0 governs the
          HEIGHT and overrides h-13. The form has no height of its own, so there
          is no free space for flex-grow to claim and the field collapsed to its
          content: 21px, one line of text, beside a 52px button. Scoping the
          modifier to sm keeps the grow where the main axis is horizontal and it
          means something, and leaves h-13 in charge when the two are stacked.
        */
        className="border-line focus:border-primary text-navy shadow-soft h-13 min-w-0 rounded-input border bg-white px-4 text-[0.9375rem] outline-none transition-colors duration-150 sm:flex-1"
      />
      {/*
        ⚠️ NOT "Check my site" — that is the nav, the mobile drawer and the
        final CTA, which all point here. Those are links to a page; this makes
        an account, and a button that creates something should say so.

        ⚠️ SHORT, BECAUSE THE BUTTON SHARES A ROW WITH THE FIELD. Measured on
        the hero at 1280, where the row is a fixed 448px and `sm:flex-1` gives
        the field whatever the button leaves:

          "Get Started Now"   button 215  ·  field 221   (near parity)
          "Get Started"       button 176  ·  field 260   (field 1.48x)

        At the longer label the control that takes the address was the same
        width as the button beside it, which inverts what the row is for. The
        label is the only lever here — there is no width to set.

        ⚠️ THIS LABEL IS THE HERO'S ONLY COST SIGNAL, AND IT NO LONGER CARRIES
        ONE. It read "Start free", and the note here said "free" was the only
        word left in the hero saying it costs nothing — which was measured, not
        assumed: grepping hero.tsx for free / no card / cost / $ returns nothing
        but this button. So the hero now asks a visitor to start without telling
        them it is free, and the reassurance has to come from somewhere else if
        it is wanted. /free-report is unaffected: its "Free · No cc required"
        pill sits directly above this form.

        ⚠️ THE TWO PAGES NOW SAY DIFFERENT WORDS, WHICH THIS NOTE USED TO WARN
        AGAINST. It said to add a `label` prop rather than fork the component if
        they ever genuinely needed to differ — so that is what happened, and the
        prop is the whole difference. The FORM is still one component: same
        action, same field, same GET, same everything a visitor submits. Only
        the label and the row width vary, and both are arguments.

        The hero says "Get Started" beside a 448px row. /free-report says
        "Analyze Now" beside 576px, because it is a page about running a check
        rather than a headline about the product, and it has the column to
        spare. If a third caller appears, give it a label — do not copy the file.
      */}
      <Button type="submit" size="lg" arrow>
        {label}
      </Button>
    </form>
  );
}
