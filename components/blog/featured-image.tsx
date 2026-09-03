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
  className = 'rounded-xl',
}: {
  meta: PostMeta;
  /** Set on the post page's own lead image — it is the LCP element there. */
  priority?: boolean;
  sizes: string;
  /**
   * Corner treatment, and only that.
   *
   * ⚠️ IT EXISTS SO A CARD CAN CLIP THIS INSTEAD. The archive's tiles round and
   * clip their own outer edge, and an image that also rounds itself leaves a
   * notch where the two radii disagree — so those pass `rounded-none` and let
   * the card do it. The default keeps every other caller exactly as it was.
   */
  className?: string;
}) {
  if (!meta.image) {
    return (
      /* ⚠️ THE FALLBACK TAKES className TOO. It is easy to change only the
         branch below, because every post has an image today and this one never
         renders — it would first appear the day somebody publishes without one,
         which is the whole case this branch exists for. */
      <div
        className={`bg-brand-gradient-bright grain relative flex aspect-video items-end overflow-hidden ${className}`}
      >
        {/* Navy on cyan, never white — the gradient is far too light to carry
            white type at 4.5:1. */}
        <p className="font-display text-navy relative p-6 text-lg leading-snug font-extrabold text-balance sm:p-8 sm:text-2xl">
          {meta.title}
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-cloud relative aspect-video overflow-hidden ${className}`}>
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
