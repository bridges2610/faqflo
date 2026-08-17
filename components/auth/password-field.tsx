'use client';

import { useId, useState } from 'react';

import { FIELD, FieldLabel } from './auth-card';

/*
  A password field you can unmask.

  Masking is right by default and wrong with no way out: a typo on sign-up
  creates an account with a password nobody knows, and on sign-in it produces a
  lockout the person cannot diagnose. Reset is the worst of the three — a
  password they have never typed before, entered twice, blind, against a length
  rule that only announces itself after a failed submit.

  Shared rather than repeated because the four password inputs across the auth
  screens were byte-identical, and the fiddly parts here — the padding override,
  the centring against a field that carries its own margin, keeping the focus
  ring inside the border — are exactly the parts that drift when copied.
*/

/*
  Eye and eye-off, on the same 20×20 grid and 1.6 stroke as the icons in
  components/ui/icons.tsx and components/dashboard/nav-icons.tsx.

  Here rather than in components/ui/icons.tsx because that file's own comment
  says it is for icons shared by more than one surface, and these have exactly
  one consumer. The moment anything else needs an eye, they belong there.
*/
const ICON = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function EyeIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...ICON} className={className}>
      <path d="M1.9 10S5 4.6 10 4.6 18.1 10 18.1 10 15 15.4 10 15.4 1.9 10 1.9 10Z" />
      <circle cx="10" cy="10" r="2.4" />
    </svg>
  );
}

function EyeOffIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...ICON} className={className}>
      <path d="M1.9 10S5 4.6 10 4.6 18.1 10 18.1 10 15 15.4 10 15.4 1.9 10 1.9 10Z" />
      <circle cx="10" cy="10" r="2.4" />
      {/* The struck-through eye, rather than a second drawing of a different
          eye: the two icons swap in place, so only the slash should move. */}
      <path d="M4.2 15.8 15.8 4.2" />
    </svg>
  );
}

export function PasswordField({
  label,
  name,
  autoComplete,
  minLength,
  hint,
}: {
  label: string;
  name: string;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
  /** The "At least 8 characters." line, where there is one. */
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const hintId = useId();

  const action = shown ? 'Hide password' : 'Show password';

  return (
    <div>
      {/*
        htmlFor rather than the wrapping <label> the other fields use. A
        <button> inside a <label> inherits the label's implicit activation, so
        every click on the toggle would also be a click on the field — two
        controls fighting over one gesture.
      */}
      <label htmlFor={id} className="block">
        <FieldLabel>{label}</FieldLabel>
      </label>

      <div className="relative">
        {/*
          The type flips on THIS element rather than swapping in a second
          input. The node survives the change and so does what was typed;
          rendering two inputs conditionally would clear the field on every
          reveal, which is the one thing this control must not do.

          pr-11 keeps the text clear of the button. It beats FIELD's px-3
          because Tailwind emits .px-* before .pr-*, not because of where it
          sits in the string — class order in the markup decides nothing.
        */}
        <input
          id={id}
          className={`${FIELD} pr-11`}
          type={shown ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          aria-describedby={hint ? hintId : undefined}
          required
          minLength={minLength}
        />

        {/*
          FIELD carries its own mt-1.5, so the input starts 6px below this
          wrapper's top edge. Spanning top-1.5 → bottom-0 makes this box the
          input's box, and centring against it then needs no height hardcoded
          anywhere.

          right-1.5 and a small button, so the global 3px :focus-visible ring
          (globals.css, with its 2px offset) lands inside the field border
          instead of poking out of it. FIELD can only carry outline-none
          because that rule exists.
        */}
        <span className="absolute top-1.5 right-1.5 bottom-0 flex items-center">
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            // The name changes, and there is deliberately no aria-pressed:
            // together they get read as "Hide password, pressed", which
            // describes the state as its own opposite.
            aria-label={action}
            title={action}
            // Lighter than the text-slate icon buttons in the dashboard: those
            // sit in their own row, this one sits inside a field. At full slate
            // it reads as part of the value being typed.
            className="text-slate/60 hover:text-primary hover:bg-cloud rounded-md p-1 transition-colors duration-150"
          >
            {shown ? <EyeOffIcon className="h-4.5 w-4.5" /> : <EyeIcon className="h-4.5 w-4.5" />}
          </button>
        </span>
      </div>

      {hint && (
        <span id={hintId} className="text-slate mt-2 block text-xs">
          {hint}
        </span>
      )}
    </div>
  );
}
