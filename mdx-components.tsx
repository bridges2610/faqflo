import type { MDXComponents } from 'mdx/types';
import { A, Code, H2, H3, Hr, Img, Li, Ol, P, Pre, Quote, Strong, Ul } from '@/components/blog/post-prose';

/*
  Maps markdown output onto the site's type scale.

  Required by @next/mdx in the App Router — "will not work without it" per
  next/dist/docs. Living at the project root is part of the convention, not a
  preference.

  Note the signature: useMDXComponents() takes NO arguments in this version of
  Next. Older releases passed the default components in as a parameter, and
  that shape is wrong here.

  No h1 mapping on purpose. The post's <h1> is rendered by the template from
  the post's title, so a body that opens with `# Something` would give the page
  two of them. Post bodies start at `##`.
*/
const components: MDXComponents = {
  p: P,
  h2: H2,
  h3: H3,
  ul: Ul,
  ol: Ol,
  li: Li,
  a: A,
  blockquote: Quote,
  strong: Strong,
  hr: Hr,
  img: Img,
  code: Code,
  pre: Pre,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
