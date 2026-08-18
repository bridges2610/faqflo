import type { MetadataRoute } from 'next';
import { POSTS } from '@/lib/blog/posts';
import { SITE_URL } from '@/lib/site';

/*
  sitemap.xml.

  ⚠️ WE DID NOT HAVE ONE. Our own `sitemap` check fails a site outright when
  /sitemap.xml does not resolve, and warns when it exists but robots.txt does
  not declare it — both halves are now covered, here and in app/robots.ts.

  ⚠️ PUBLIC ROUTES ONLY. Everything under (app) and (auth) is
  `robots: { index: false, follow: false }`, and listing a noindex URL in a
  sitemap is a contradiction: it asks a crawler to fetch a page whose own
  metadata then tells it to forget what it found.

  Blog posts are derived rather than listed. lib/blog/posts.ts already validates
  every date as ISO and already drops drafts outside development and preview, so
  a draft cannot leak into the sitemap and a post cannot arrive with a
  lastModified nothing verified.
*/

/** Static routes, highest intent first. */
const PAGES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/seo-guide', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/done-for-you', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  /*
    The newest post's date stands in for the blog index, which genuinely does
    change when a post lands. Everything else gets today — a build date is the
    honest answer for a page whose content ships with the deploy.
  */
  const newestPost = POSTS[0]?.meta.date;
  const built = new Date();

  const staticPages = PAGES.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified: page.path === '/blog' && newestPost ? new Date(newestPost) : built,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  const posts = POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.meta.slug}`,
    lastModified: new Date(post.meta.date),
    changeFrequency: 'yearly' as const,
    // Above the policy pages, below the guide: a post is real content, but the
    // guide is the page we would rather rank.
    priority: 0.6,
  }));

  return [...staticPages, ...posts];
}
