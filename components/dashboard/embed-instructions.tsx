'use client';

import { useId, useState } from 'react';

import {
  DEFAULT_EMBED_PLATFORM,
  EMBED_GUIDES,
  embedGuide,
  isEmbedPlatformId,
  type EmbedPlatformId,
} from '@/lib/dashboard/export';
import { EmbedStepList } from './embed-steps';

/*
  Pick your builder, get its steps.

  Six platforms with four steps and a caveat each is a lot of text to put in
  front of somebody who uses exactly one of them. So one at a time here, where
  the reader has a specific site in front of them — and all six expanded on the
  Help page, where they are reading rather than doing. Same EMBED_GUIDES data
  either way; only the selection lives here.

  Not WorkspaceTabs. That is a <nav> of <Link>s with aria-current="page", and
  its own comment says the routing is deliberate. This is in-page state, so it
  needs <button> and aria-pressed, and it must NOT be a nav landmark — a builder
  picker is not site navigation.

  The pill styling is the segmented-control idiom already in generator-panel.tsx
  and group-workspace.tsx, with the same class strings. That makes four copies
  of it counting WorkspaceTabs; a fifth is the point at which it should come out
  into components/dashboard/pill-group.tsx rather than be copied again.
*/

/*
  A preference, not data — which is why it is not namespaced by account.

  lib/dashboard/store.ts keys its storage by user id because two people sharing
  a browser must not see each other's answers. This is a different kind of
  value: which website builder the person in front of the screen uses, which
  belongs to them and their laptop rather than to an account. The failure it
  accepts is narrow — one browser, two accounts, two different builders — and it
  costs one click to correct.

  (If that stops being acceptable, the shape to move to is per-SITE, not
  per-user: a customer with a WordPress site and a Shopify site is the likelier
  version of this problem, and PublishWorkspace already knows the site.)
*/
const PLATFORM_KEY = 'faqflo.publish.platform';

export function EmbedInstructions() {
  /*
    Read during the first render, deliberately, and safe for two reasons.

    ⚠️ ONE: THIS SUBTREE NEVER RENDERS ON THE SERVER. app-shell.tsx renders its
    children only once the dashboard has loaded, and lib/dashboard/provider.tsx
    loads in a post-mount effect — so during SSR the shell is a skeleton and
    PublishWorkspace does not exist. There is no server HTML for this to
    disagree with.

    ⚠️ TWO: the guard is here anyway, because reason one is a property of two
    other files. If app-shell ever renders children eagerly, this falls back to
    the default instead of throwing.

    The usual advice — default in state, real value in a mount effect — is wrong
    here: it would flash "WordPress" at every returning Shopify customer on
    every visit, which is the exact thing remembering the choice prevents.
  */
  const [platform, setPlatform] = useState<EmbedPlatformId>(() => {
    if (typeof window === 'undefined') return DEFAULT_EMBED_PLATFORM;
    try {
      const stored = window.localStorage.getItem(PLATFORM_KEY);
      // Validated, not trusted: an id dropped in a later release is a value
      // this browser will still hand back, and it must not blank the card.
      return stored && isEmbedPlatformId(stored) ? stored : DEFAULT_EMBED_PLATFORM;
    } catch {
      return DEFAULT_EMBED_PLATFORM;
    }
  });

  function choose(id: EmbedPlatformId) {
    setPlatform(id);
    // Refused storage — private mode, a locked-down browser, a full quota —
    // costs a remembered preference and nothing else. Same trade as useCopy():
    // there is no recovery worth writing, and the picker still works this visit.
    try {
      window.localStorage.setItem(PLATFORM_KEY, id);
    } catch {
      /* preference only */
    }
  }

  const headingId = useId();
  const panelId = useId();

  return (
    <>
      {/*
        The WorkspaceTabs tray with two changes, each with a reason.

        flex-wrap because there are six of these and "Hand-coded, or anything
        else" is long — a single row runs off the side of a phone, and a picker
        whose last two options are off-screen is a picker with four options.

        rounded-2xl rather than rounded-pill on the TRAY only: a pill-shaped
        tray wrapping onto two rows puts semicircular end caps around a
        rectangle of content. The pills inside stay rounded-full, which is the
        part anyone recognises.
      */}
      <div
        role="group"
        aria-label="Your website platform"
        className="bg-cloud border-line mt-4 flex flex-wrap items-center gap-1 rounded-2xl border p-1"
      >
        {EMBED_GUIDES.map((guide) => (
          <button
            key={guide.id}
            type="button"
            aria-pressed={platform === guide.id}
            aria-controls={panelId}
            onClick={() => choose(guide.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
              platform === guide.id
                ? 'text-navy shadow-soft bg-white font-semibold'
                : 'text-slate hover:text-navy'
            }`}
          >
            {guide.platform}
          </button>
        ))}
      </div>

      {/*
        A labelled region rather than an aria-live one. The heading inside it
        changes with the selection, so somebody who moves into the region hears
        which platform they are in; announcing four steps on every press would
        talk over a person still choosing.
      */}
      <div id={panelId} role="region" aria-labelledby={headingId} className="mt-5">
        <EmbedStepList guide={embedGuide(platform)} headingAs="h3" headingId={headingId} />
      </div>
    </>
  );
}
