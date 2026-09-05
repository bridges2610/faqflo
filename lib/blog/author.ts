/*
  Who writes the blog. Split out of lib/blog/posts.ts, and the reason is 261KB.

  ⚠️ THIS FILE EXISTS SO A CLIENT COMPONENT CAN NAME THE AUTHOR WITHOUT
  IMPORTING THE ENTIRE BLOG. posts.ts imports all 22 MDX posts to build the
  registry, so ANY value import from it drags every post body into whichever
  bundle the importer belongs to. components/marketing/busy-button.tsx is a
  client component mounted in the marketing layout on every public page, and it
  imported AUTHOR/AUTHOR_AVATAR from posts.ts — which put the whole corpus into
  the shared client chunk.

  Measured on a production build before the split: every marketing page,
  including / and /about, downloaded a 261KB chunk containing post prose
  ("nineteen posts deep", "Summit Roofing keeps two crews on call"). Nothing on
  those pages renders a post.

  ⚠️ SO KEEP THIS MODULE FREE OF IMPORTS. It holds three constants and must
  stay that way; the moment it reaches for anything in posts.ts the split stops
  working and nobody will notice, because the only symptom is a bigger download.

  posts.ts re-exports all three, so the byline, the BlogPosting schema and the
  author bio keep importing from wherever they already did — the point of one
  source is that these three strings cannot describe two different people.
*/

export const AUTHOR = 'Beau';
export const AUTHOR_AVATAR = '/headshot/beau-faqflo.jpeg';

/* Apostrophes are the curly character, not the ASCII one — house convention,
   and it saves escaping every "I’m" inside a single-quoted string. */
export const AUTHOR_BIO =
  '👋 Hi, I’m Beau. I’ve spent almost 20 years in marketing — long enough to watch the whole game change more than once. I was there when SEO was the answer, then social, then content, and now the biggest shift yet: people asking AI instead of Googling. Somewhere along the way I got tired of watching good small businesses do everything “right” and still stay invisible to the tools that increasingly decide who gets found. That’s why I built FaqFlo — my mission is to help you grow your business in the modern world of AI, so you become the answer, not just another link nobody clicks.';
