'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Copy to the clipboard, with a short-lived "copied" flag for feedback.
 *
 * A rejected write is swallowed on purpose. Clipboard access can be refused —
 * insecure context, denied permission, an embedded browser — and there is
 * nothing to recover: every caller has the text on screen and selectable, so
 * the fallback is the one the user already knows. What we must not do is leave
 * the tick showing when nothing was copied.
 */
export function useCopy(resetAfterMs = 2200) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on unmount matters here: these buttons live inside group cards
  // that get unmounted by the disclosure, and a pending setState on a gone
  // component is a leak with a warning attached.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy(text: string): Promise<boolean> {
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }

    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), resetAfterMs);
    return true;
  }

  return { copied, copy };
}
