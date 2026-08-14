import Image from 'next/image';
import { AUTHOR, AUTHOR_AVATAR, AUTHOR_BIO } from '@/lib/blog/posts';

/*
  The author bio at the end of a post.

  A hairline rule rather than a Card, for two reasons. Nothing else in
  components/blog uses Card — the blog's whole idiom is rules between sections —
  and this sits directly above the full-bleed FinalCta band, where a boxed card
  would read as two competing panels stacked on top of each other.

  The photo is alt="" on purpose. The author's name renders as text in the very
  next element, so describing the image would announce "Beau" twice to a screen
  reader. Decorative is the correct call when the caption is right there.

  No call to action inside it, for the same reason: FinalCta is the next thing
  on the page, and a post that ends with three consecutive asks is a post nobody
  finishes.
*/
export function PostAuthor() {
  return (
    <section className="border-line mt-14 border-t pt-10">
      {/* Media object: the photo stacks above the bio on a phone and sits
          beside it from sm up. shrink-0 stops the bio squeezing the avatar
          out of round. */}
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <Image
          src={AUTHOR_AVATAR}
          alt=""
          width={80}
          height={80}
          className="bg-cloud h-16 w-16 shrink-0 rounded-full object-cover sm:h-20 sm:w-20"
        />

        <div>
          <p className="text-slate font-mono text-xs tracking-wide uppercase">Written by</p>
          <h2 className="mt-1 text-xl">{AUTHOR}</h2>
          {/* One step below the prose P (1.0625rem), which is the site's
              standard subordinate body size. The bio is an aside about the
              writer, not more article — sizing it level with the post made it
              read as a final section rather than a signature. */}
          <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">{AUTHOR_BIO}</p>
        </div>
      </div>
    </section>
  );
}
