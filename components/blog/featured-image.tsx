import Image from 'next/image';
import type { PostMeta } from '@/lib/blog/posts';

/*
  A post's lead image, or a stand-in when there isn't one.

  The fallback exists because the template shipped before any photography did.
  Rather than leave a hole or a grey box, a post with no image gets the brand
  gradient with its title over it — which looks deliberate in the archive and
  stops an unillustrated post reading as broken. Setting `image` on the post's
  meta swaps it out; nothing else changes.

  next/image with local files under public/ needs no next.config entry —
  remotePatterns is only for external hosts.
*/
export function FeaturedImage({
  meta,
  priority = false,
  sizes,
}: {
  meta: PostMeta;
  /** Set on the post page's own lead image — it is the LCP element there. */
  priority?: boolean;
  sizes: string;
}) {
  if (!meta.image) {
    return (
      <div className="bg-brand-gradient-bright grain relative flex aspect-[16/9] items-end overflow-hidden rounded-xl">
        {/* Navy on cyan, never white — the gradient is far too light to carry
            white type at 4.5:1. */}
        <p className="font-display text-navy relative p-6 text-lg leading-snug font-extrabold text-balance sm:p-8 sm:text-2xl">
          {meta.title}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-cloud relative aspect-[16/9] overflow-hidden rounded-xl">
      <Image
        src={meta.image}
        alt={meta.imageAlt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
