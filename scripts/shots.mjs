#!/usr/bin/env node
/**
 * Regenerate the dashboard screenshots used on the home page.
 *
 * Captures app/(dev)/shots — five real workspaces rendered from the fixture in
 * lib/dashboard/seed.ts — and writes one PNG per panel into public/screenshots.
 *
 * Run it whenever a dashboard screen changes shape. The whole point of the
 * route plus this script existing is that the marketing images are rebuilt with
 * one command rather than re-framed by hand in a screenshot tool, which is how
 * product shots quietly drift a year out of date.
 *
 *   npm run dev        (in another terminal)
 *   npm run shots
 *
 * ⚠️ IT NEEDS THE DEV SERVER, AND DELIBERATELY WILL NOT START ONE. Spawning a
 * server here would mean owning its lifetime, its port collisions and its
 * shutdown on every failure path, to save one terminal. It checks and tells you
 * instead.
 *
 * ⚠️ DEV ONLY, BECAUSE THE ROUTE IS. app/(dev)/shots calls notFound() outside
 * development, so pointing this at a production build gets five 404s.
 *
 * Playwright is a devDependency and never ships. It is the first tool of its
 * kind in a repo that keeps its dependency list short on purpose — the trade is
 * that the alternative was a manual process nobody would repeat.
 */

import { chromium } from 'playwright';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ORIGIN = process.env.SHOTS_ORIGIN ?? 'http://localhost:3000';
const OUT = 'public/screenshots';

/**
 * ⚠️ THESE KEYS ARE A CONTRACT WITH TWO OTHER FILES: the `data-shot` attributes
 * in app/(dev)/shots/page.tsx, and the imports in
 * components/marketing/product-shots.tsx. Renaming one means renaming three.
 */
const PANELS = ['audit', 'answers', 'results', 'overview', 'competitors'];

/**
 * Retina. The panels are 1200 CSS px, so this writes 2400px files — the width
 * the existing public/blog images already use, and enough that next/image can
 * serve a sharp 2x on a laptop without upscaling.
 */
const SCALE = 2;

function bytes(n) {
  return `${(n / 1024).toFixed(0)} KB`;
}

async function main() {
  // Fail on a dead server with the fix in the message, rather than a Playwright
  // timeout thirty seconds later that says ERR_CONNECTION_REFUSED.
  try {
    const res = await fetch(`${ORIGIN}/shots`, { redirect: 'manual' });
    if (!res.ok) {
      throw new Error(
        `${ORIGIN}/shots returned ${res.status}. That route only exists in development — is this a production build?`,
      );
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Could not reach ${ORIGIN}. Start the dev server first:\n\n  npm run dev\n`);
    }
    throw err;
  }

  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    // Wider than the 1200px panels so nothing is squeezed by a scrollbar.
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: SCALE,
  });

  try {
    /*
      ⚠️ HIDE NEXT'S DEV OVERLAY BEFORE CAPTURING ANYTHING.

      The dev-tools badge — the little "N" with an issue count — is
      position: fixed, so it is inside the viewport region an element
      screenshot crops from and it lands in the picture. The first run of this
      script shipped a marketing shot with "2 Issues" stamped across the
      bottom-left of the audit panel.

      addStyleTag rather than `devIndicators: false` in next.config.ts: the
      overlay is genuinely useful while developing, and turning it off for the
      whole project to fix five screenshots is the wrong trade. This is scoped
      to the page this script drives.
    */
    await page.addStyleTag({
      content: 'nextjs-portal, [data-nextjs-toast], #next-logo { display: none !important }',
    });

    await page.goto(`${ORIGIN}/shots`, { waitUntil: 'networkidle' });

    // Again after navigation — addStyleTag above applies to the document that
    // was loaded when it ran, and goto() replaces it.
    await page.addStyleTag({
      content: 'nextjs-portal, [data-nextjs-toast], #next-logo { display: none !important }',
    });

    for (const key of PANELS) {
      const panel = page.locator(`[data-shot="${key}"]`);
      await panel.waitFor({ state: 'visible', timeout: 30_000 });

      /*
        ⚠️ WAIT FOR CONTENT, NOT JUST FOR THE BOX. The route is a client
        component: the panel div exists in the first paint while the fixture is
        still being built in a useMemo, so a capture triggered on visibility
        alone can catch an empty frame. A panel with real height is the cheapest
        honest signal that its workspace has rendered something.
      */
      await page
        .waitForFunction(
          (k) => {
            const el = document.querySelector(`[data-shot="${k}"]`);
            // The window is a fixed 860px, so height alone proves nothing here.
            // A populated panel has real children with real height inside it.
            const inner = el instanceof HTMLElement ? el.firstElementChild : null;
            return inner instanceof HTMLElement && inner.offsetHeight > 400;
          },
          key,
          { timeout: 30_000 },
        )
        .catch(() => {
          throw new Error(
            `Panel "${key}" never grew past 400px — it probably rendered an empty state. Open ${ORIGIN}/shots and look.`,
          );
        });

      const path = join(OUT, `dashboard-${key}.png`);
      await panel.screenshot({ path });
      console.log(`  ${key.padEnd(9)} → ${path}`);
    }
  } finally {
    await browser.close();
  }

  const files = (await readdir(OUT)).filter((f) => f.endsWith('.png')).sort();
  let total = 0;
  console.log('');
  for (const f of files) {
    const { size } = await stat(join(OUT, f));
    total += size;
    console.log(`  ${f.padEnd(28)} ${bytes(size).padStart(8)}`);
  }
  console.log(`  ${''.padEnd(28)} ${bytes(total).padStart(8)}  total`);
}

main().catch((err) => {
  console.error(`\nshots: ${err.message}\n`);
  process.exit(1);
});
