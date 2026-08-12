/*
  Adds the `meta` export to every .mdx module.

  @types/mdx declares `*.mdx` with only a default export; ambient declarations
  merge, so this adds a named one rather than replacing it. The pattern is the
  one @types/mdx documents for exactly this case.

  PostMeta is pulled in with an inline import() type on purpose. A top-level
  `import` statement would make this file a module, which turns the block below
  into module *augmentation* — and you cannot augment a wildcard module that
  way, so every .mdx import fails to resolve. Keeping the file script-scoped is
  what makes it an ambient declaration.

  What this does and does not buy: consumers of `meta` get a real PostMeta, so
  the archive and template are type-checked as before. It does NOT check the
  object literal inside a .mdx file — tsc never parses those. A post that omits
  `date`, or sets `image` without `imageAlt`, type-checks fine here and is
  caught instead by validate() in lib/blog/posts.ts, which throws during the
  build.
*/
declare module '*.mdx' {
  export const meta: import('@/lib/blog/posts').PostMeta;
}
