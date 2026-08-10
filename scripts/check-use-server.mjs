#!/usr/bin/env node
/**
 * Every export from a `'use server'` file must be an async function.
 *
 * Why this exists as a check rather than a code review habit: the rule is
 * enforced by Next at MODULE-EVALUATION time. For a `force-dynamic` route that
 * means "the first time a signed-in person loads the page" — long after
 * `typecheck` and `build` have both gone green. We shipped
 * `export const NO_ERROR = { error: null }` from lib/auth/actions.ts and found
 * out when the dashboard threw for a real user.
 *
 * Types and interfaces are fine; they are erased before any of this applies.
 *
 * Run via `npm run check`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;

/** An export line that is allowed to exist in a 'use server' module. */
const ALLOWED = /^export\s+(async\s+function|type\s|interface\s|\{[^}]*\}\s*from)/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (SOURCE.test(entry)) out.push(path);
  }
  return out;
}

const problems = [];
let checked = 0;

for (const root of ROOTS) {
  let files;
  try {
    files = walk(root);
  } catch {
    continue; // Directory absent — nothing to check.
  }

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // The directive only counts at the top of the module.
    if (!/^\s*(['"])use server\1/m.test(source.slice(0, 200))) continue;

    checked += 1;
    source.split('\n').forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('export ')) return;
      if (ALLOWED.test(trimmed)) return;
      problems.push(`${relative('.', file)}:${i + 1}  ${trimmed}`);
    });
  }
}

if (problems.length > 0) {
  console.error("A 'use server' file may only export async functions.\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nMove shared values into a plain module — see lib/auth/form-state.ts.');
  process.exit(1);
}

console.log(`check-use-server: ${checked} file(s) checked, all exports are async functions.`);
