import Link from 'next/link';
import { FeaturedImage } from '@/components/blog/featured-image';
import { Badge } from '@/components/ui/badge';
import { formatPostDate, type PostMeta } from '@/lib/blog/posts';

/*
  One row of the archive.

  The whole card is the link rather than just the title: it is a single
  destination, and a 16:9 image sitting next to a headline that goes somewhere
  reads as clickable whether or not it is. The title text gives the link its
  accessible name, so the image needs no duplicate label.
*/
export function PostCard({ meta, priority }: { meta: PostMeta; priority?: boolean }) {
  return (
    <article>
      <Link href={`/blog/${meta.slug}`} className="group block">
        <FeaturedImage
          meta={meta}
          priority={priority}
          // One column, capped at the article measure — never the full viewport
          // above that, so phones don't fetch a desktop-sized crop.
          sizes="(min-width: 768px) 46rem, 100vw"
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <time dateTime={meta.date} className="text-slate font-mono text-xs tracking-wide uppercase">
            {formatPostDate(meta.date)}
          </time>
          {/* Only ever rendered where drafts are visible at all, but it has to
              be here: without it a draft is indistinguishable from a live post
              on localhost. */}
          {meta.draft && <Badge tone="blue">Draft</Badge>}
        </div>

        <h2 className="group-hover:text-primary mt-2 text-[1.5rem] leading-snug text-balance transition-colors duration-150 sm:text-[1.75rem]">
          {meta.title}
        </h2>

        <p className="text-slate mt-3 text-[1.0625rem] leading-[1.75]">{meta.excerpt}</p>

        <span className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
          Read it
          <span
            className="ease-bounce transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          >
            →
          </span>
        </span>
      </Link>
    </article>
  );
}
