import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // TypeScript 7 dropped the compiler API Next.js uses by default. This routes
    // type checking through the `tsc` CLI so we can stay on TS 7 rather than
    // pinning back to 6.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
