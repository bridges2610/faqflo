'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { useDashboard } from '@/lib/dashboard/provider';
import { useScanJob } from '@/lib/dashboard/use-scan-job';

/*
  Three questions, asked while the first scan runs.

  ⚠️ THE TIMING IS THE WHOLE DESIGN. This screen already makes somebody wait a
  minute or two watching a progress bar, which is the only dead time in the
  product. Asking here costs them nothing; asking on a later screen would be an
  interruption to something they came to do.

  ⚠️ IT WRITES profile_source: 'manual', AND THAT IS THE POINT RATHER THAN A
  DETAIL. The audit stage of the same scan infers industry and location from the
  site's own markup and writes them with `.neq('profile_source', 'manual')` —
  see lib/scan/run.ts. So whichever finishes first, the customer's answer wins:
  save before the crawl and the crawl declines to overwrite it, save after and
  this overwrites the guess. The race is real and both orders are correct.

  ⚠️ WHAT THIS FEEDS IS NOT COSMETIC. industry and location are read by
  lib/questions-generate.ts, lib/dashboard/discover.ts and
  lib/dashboard/content-plan.ts, and by the tracking stage in lib/scan/run.ts —
  they decide which questions get discovered, what the content plan proposes,
  and what the engines are actually asked. A blank profile is why a plumber gets
  generic suggestions.

  ⚠️ `name`, NEVER `brand_name`. They look interchangeable and are not.
  brand_name is what lib/tracking/classify.ts searches for in an engine's answer,
  so it decides what counts as a mention — it is evidence about results, and
  0007 makes it service-role for that reason. A customer who could type it could
  enter something generic and inflate their own citation count. `name` is the
  display label, which is exactly what a person should get to choose.
*/
export function OnboardingProfile() {
  const { site, renameSite } = useDashboard();
  const router = useRouter();

  /*
    ⚠️ ONLY WHAT THE CUSTOMER TYPED LIVES IN STATE. Everything else is read off
    the site row during render, which is what lets the audit's findings appear in
    these fields while somebody is looking at them.

    The obvious alternative — seed useState from the row, then sync it with an
    effect when the row changes — has to answer "should this arriving value
    overwrite what they are halfway through typing?", and gets it wrong on some
    ordering. Deriving makes "typed wins" a property of the expression below
    rather than a rule anybody has to maintain.
  */
  const [edited, setEdited] = useState<{ name?: string; industry?: string; location?: string }>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [skipped, setSkipped] = useState(false);

  /*
    ⚠️ ONE REFRESH, WHEN THE AUDIT HAS FINISHED WRITING.

    The audit is the FIRST stage of the scan running behind this form, and it
    writes industry and location from the site's own markup as
    profile_source: 'schema' (lib/scan/run.ts). Those land on `sites`, which is
    server-rendered by app/(app)/layout.tsx — so router.refresh() re-runs that
    layout, the provider's load effect re-keys on the new array, and the fields
    below fill themselves in.

    ⚠️ BEHIND A ref, NOT ON EVERY TICK. useScanJob polls every three seconds;
    without the guard this would re-run the server layout for the whole scan.

    ⚠️ AND ONLY WHILE THE FORM IS STILL OPEN. Once it is saved or skipped there
    is nothing left to prefill, so a refresh is pure cost.

    Calling useScanJob here adds no polling: its watcher map is module-scoped so
    that N components share one interval — see the note on `watchers`.
  */
  const { job } = useScanJob(site?.id ?? '');
  const refreshed = useRef(false);
  const open = Boolean(site) && site?.profileSource !== 'manual' && !done && !skipped;

  useEffect(() => {
    if (!open || refreshed.current) return;
    if (!job || job.stage === 'audit') return;
    refreshed.current = true;
    router.refresh();
  }, [open, job, router]);

  /* No site yet: the row is created by the POST in OnboardingStart, and this
     renders on the reload after it. Nothing to attach an answer to before then. */
  if (!site) return null;

  /*
    Most people type their domain into the home page form, so `name` is usually
    "summitroofing.com" rather than a business name. Offering that back as a
    prefilled answer would invite them to accept it, which teaches us nothing —
    an empty field with a real example asks the question properly.
  */
  const detectedName =
    site.name.trim() && !isNamedAfterDomain(site.name, site.domain) ? site.name : '';

  /* ⚠️ `?? `, NOT `||`. An empty string is a real answer — it is somebody
     clearing a field we prefilled — and `||` would quietly hand the crawl's
     value straight back to them. */
  const name = edited.name ?? detectedName;
  const industry = edited.industry ?? site.industry ?? '';
  const location = edited.location ?? site.location ?? '';

  /* Whether anything in front of them came from the crawl rather than their own
     keyboard. Drives the one line of copy that says so. */
  const detected =
    (!edited.name && detectedName) ||
    (!edited.industry && site.industry) ||
    (!edited.location && site.location);

  /*
    ⚠️ ALREADY ANSWERED MEANS ALREADY ANSWERED. 'manual' is the one source that
    can only have come from a person, so re-asking would be the product
    forgetting something it was told. The Sites page keeps the same fields
    editable afterwards.
  */
  if (site.profileSource === 'manual' || skipped) return null;

  if (done) {
    return (
      <Card tone="cloud" className="mt-5 p-5">
        <p className="text-navy text-[0.9375rem] font-semibold">Thanks — that helps.</p>
        <p className="text-slate mt-1.5 text-sm leading-relaxed">
          We’ll use it to find the questions people ask about your trade in your area. You can
          change any of it later on the Sites page.
        </p>
      </Card>
    );
  }

  const field =
    'border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150';
  const label = 'text-slate font-mono text-[0.6875rem] tracking-wide uppercase';

  /* Nothing typed is not an answer. Saving it would stamp profile_source
     'manual' over three empty strings and permanently stop the audit filling
     them in — the one outcome worse than not asking. */
  const empty = !name.trim() && !industry.trim() && !location.trim();

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await renameSite(site!.id, {
        /* Only sent when they typed one. Blanking the display label would leave
           the site switcher and the header with nothing to show. */
        ...(name.trim() ? { name: name.trim() } : {}),
        industry: industry.trim() || null,
        location: location.trim() || null,
        profileSource: 'manual',
      });
      setDone(true);
    } catch {
      setError('That didn’t save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone="cloud" className="mt-5 p-5 sm:p-6">
      <h2 className="text-navy text-[1.0625rem]">While that runs — who are you?</h2>
      {/* Says what it buys them. Without this it reads as account admin, and
          there is no reason to fill in account admin. */}
      <p className="text-slate mt-1.5 text-sm leading-relaxed">
        Three quick answers. They decide which questions we look for, what we suggest you write,
        and how the AI engines get asked about you — so the more specific, the better everything
        below gets.
      </p>

      {/* ⚠️ ONLY WHEN SOMETHING WAS ACTUALLY FOUND. A prefilled field with no
          explanation reads as something the customer typed and forgot; the whole
          point is that it is a claim we are asking them to check. Saying it
          unconditionally would be worse — it would credit the crawl for three
          empty boxes. */}
      {detected ? (
        <p className="text-navy mt-2 text-sm leading-relaxed">
          We read some of this off your site while we were there. Check it’s right.
        </p>
      ) : null}

      {/* ⚠️ A CONTAINER QUERY, NOT sm:. This form renders in two places of very
          different widths — inline on the setup page, and inside the onboarding
          modal, which is ~424px of usable width. `sm:grid-cols-3` asks the
          VIEWPORT, so on any normal laptop the modal laid three fields across
          424px and clipped every placeholder. @lg asks the container, so it
          stacks in the modal and goes three-wide inline, from one rule. */}
      <div className="@container mt-4">
        <div className="grid gap-3 @lg:grid-cols-3">
        <label className="block">
          <span className={label}>Business name</span>
          <input
            className={field}
            value={name}
            onChange={(e) => setEdited((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Summit Roofing"
            autoComplete="organization"
          />
        </label>
        <label className="block">
          <span className={label}>Industry</span>
          <input
            className={field}
            value={industry}
            onChange={(e) => setEdited((prev) => ({ ...prev, industry: e.target.value }))}
            placeholder="Roofing contractor"
          />
        </label>
        <label className="block">
          <span className={label}>Service area</span>
          <input
            className={field}
            value={location}
            onChange={(e) => setEdited((prev) => ({ ...prev, location: e.target.value }))}
            placeholder="Rockland County, NY"
          />
        </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-error-ink mt-3 text-sm">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={saving || empty} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {/* ⚠️ SKIPPABLE ON PURPOSE. Nobody should be held away from the product
            they just signed up for by a form, and the scan fills these in on its
            own where the site's markup says so. Local state only — this screen
            is reached once, so a stored "dismissed" flag would be a column
            earning nothing. */}
        <Button size="sm" variant="ghost" type="button" onClick={() => setSkipped(true)}>
          Skip for now
        </Button>
      </div>
    </Card>
  );
}
