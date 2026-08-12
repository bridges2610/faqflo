import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets .mdx files be imported as components. Blog posts live in content/,
  // not app/, so this changes no routing today — it only matters if an .mdx
  // file is ever dropped into app/.
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  experimental: {
    // TypeScript 7 dropped the compiler API Next.js uses by default. This routes
    // type checking through the `tsc` CLI so we can stay on TS 7 rather than
    // pinning back to 6.
    useTypeScriptCli: true,
  },
};

/*
  No remark or rehype plugins, deliberately.

  This project builds with Turbopack, where plugins have to be named as strings
  and "plugins without serializable options cannot be used yet, because
  JavaScript functions can't be passed to Rust" (next/dist/docs — mdx guide).
  Posts export their metadata as a plain `export const meta` rather than YAML
  frontmatter, which @next/mdx supports natively, so there is nothing here that
  needs a plugin.
*/
const withMDX = createMDX({});

export default withMDX(nextConfig);
