'use client';

import { useState } from 'react';
import { useDashboard } from '@/lib/dashboard/provider';

/*
  Which country the answer engines are asked from.

  ⚠️ THIS IS NOT THE BUSINESS'S ADDRESS. It is the location the search is run
  as, which is why it lives apart from industry and service area: those describe
  the company, this changes what the assistants are shown. Verified against the
  live APIs — asked as GB, ChatGPT returns .co.uk roofing directories where US
  returns US ones, with no overlap at all between the two source lists.

  ⚠️ TWO ENGINES OF THREE. Gemini rejects a location parameter outright, and the
  coordinate route was tested and does not localise (see the note at the top of
  lib/tracking/gemini.ts). So this control must say so: a customer who sets
  "United Kingdom" and sees three engines listed would reasonably assume all
  three were asked from there.

  ⚠️ "Not set" is a real choice, not a placeholder. It sends no location, which
  is exactly what every run did before this existed. The alternative — guessing
  from the free-text service area, which holds things like "Rockland County, NY"
  — would present an inference as a setting, and would be wrong for precisely
  the customers who care enough to check.
*/

/**
 * A short list, not all 249.
 *
 * The markets this product is actually sold into. Adding one is a one-line
 * change; offering every ISO code would bury the four that matter behind a
 * scroll. Values are ISO 3166-1 alpha-2, which is what both vendors take.
 */
/* Exported so the onboarding form can offer the same list rather than retyping
   it — two copies would drift the first time a market is added. */
export const COUNTRIES: { code: string; label: string }[] = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'IE', label: 'Ireland' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'ES', label: 'Spain' },
];

export function countryLabel(code: string | null): string | null {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code)?.label ?? code;
}

export function SearchCountry({
  siteId,
  country,
  className = '',
}: {
  siteId: string;
  country: string | null;
  className?: string;
}) {
  const { renameSite } = useDashboard();
  const [saving, setSaving] = useState(false);
  /*
    ⚠️ A FAILED SAVE HERE IS INVISIBLE WITHOUT THIS.

    The select is controlled by the `country` prop, so a rejected write leaves
    the prop unchanged and the control snaps back to the old value on its own —
    the customer watches their choice undo itself and is told nothing. That is
    worse than an error, because it looks like the app decided against them.

    The message is the underlying one, not a friendly stand-in: updateSite
    rethrows what Postgres said, and "column sites.country does not exist"
    points at an unapplied migration where "Something went wrong" would send
    somebody hunting through the UI.
  */
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={className}>
      <label className="block">
        <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
          Ask the engines as someone in
        </span>
        <select
          value={country ?? ''}
          disabled={saving}
          onChange={async (e) => {
            setSaving(true);
            // Cleared on the attempt, not on success: leaving the previous
            // failure on screen while a new save is in flight reads as though
            // the new one had already failed too.
            setError(null);
            try {
              await renameSite(siteId, { country: e.target.value || null });
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not save your country.');
            } finally {
              setSaving(false);
            }
          }}
          className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
        >
          <option value="">Not set — no location sent</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {/* Replaces the explanation rather than sitting under it. The note
          describes what the setting will do; while the save is failing, it
          hasn't done it, and printing both invites reading the first as
          confirmation. */}
      {error ? (
        <p role="alert" className="text-error-ink mt-2 text-xs leading-relaxed">
          Your country wasn&rsquo;t saved — {error}
        </p>
      ) : (
        <p className="text-slate mt-2 text-xs leading-relaxed">
          {country
            ? 'Applies to ChatGPT and Perplexity. Gemini has no way to be asked from a country, so its results are not location-specific.'
            : 'Checks currently run with no location, so you see whatever each engine defaults to. Setting your market makes the results match what your customers would be told.'}
        </p>
      )}
    </div>
  );
}
