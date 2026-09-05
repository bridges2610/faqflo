import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSTS } from './posts';

/*
  What the archive's search box looks inside.

  ⚠️ TITLES, EXCERPTS AND FAQ QUESTIONS — NOT THE POST BODIES, AND THE NUMBERS
  ARE WHY. Measured across the 22 posts: titles and excerpts are 1.9KB, the FAQ
  questions another 5.0KB, and the full prose is 154KB raw (~46KB gzipped). The
  questions are the phrasings a reader actually types — "how many FAQs should a
  blog post have" — so they buy most of the recall of full-text search for about
  five per cent of the weight.

  If full-text is ever wanted, it is a different design, not a bigger version of
  this one: 46KB on every archive visit wants a server route, not a payload.

  ⚠️ READ FROM DISK RATHER THAN FROM THE MDX MODULES, BECAUSE THE QUESTIONS ARE
  NOT IN `meta`. They live inside each post's <PostFaq items={…}> element, which
  is renderable but not readable — a compiled MDX module exports a component,
  not its props. Parsing the source is the only way to reach them without
  duplicating all 110 questions into the frontmatter by hand.

  This runs at BUILD TIME. `server-only` is what enforces that: the archive is
  prerendered, so these files are read once during the build and never in a
  request. Importing this from a client component is a build error rather than a
  surprise, which is the point of the marker.
*/

export type SearchEntry = {
  slug: string;
  /** Everything searchable about the post, lowercased once so the filter need not. */
  text: string;
};

/*
  ⚠️ A REGEX OVER MDX, WHICH IS FINE HERE AND WOULD NOT BE IN GENERAL. It is
  matching one machine-written shape that this repo controls — the `q: '…'`
  lines inside PostFaq, which every post writes identically because they are all
  built from the same template. It is not trying to parse MDX.

  Single-quoted with escaped apostrophes is the house style for these strings
  (see any post), so the character class allows the escape.
*/
const QUESTION = /\bq:\s*'((?:[^'\\]|\\.)*)'/g;

function questionsIn(slug: string): string[] {
  try {
    const source = readFileSync(join(process.cwd(), 'content', 'posts', `${slug}.mdx`), 'utf8');
    return [...source.matchAll(QUESTION)].map((m) => m[1].replace(/\\'/g, "'"));
  } catch {
    /* ⚠️ A MISSING FILE MUST NOT BREAK THE ARCHIVE. The registry is the source
       of truth for which posts exist; if a slug and a filename ever disagree,
       the post still lists and still links — it is only less findable. Failing
       the build over a search index would be the wrong severity. */
    return [];
  }
}

/**
 * One haystack per post. Built once at module load, which on a prerendered
 * route means once per build.
 */
export const SEARCH_INDEX: SearchEntry[] = POSTS.map((post) => ({
  slug: post.meta.slug,
  text: [post.meta.title, post.meta.excerpt, ...questionsIn(post.meta.slug)]
    .join(' · ')
    .toLowerCase(),
}));
