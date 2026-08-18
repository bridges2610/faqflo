import Image, { type StaticImageData } from 'next/image';
import answersShot from '@/public/screenshots/dashboard-answers.png';
import auditShot from '@/public/screenshots/dashboard-audit.png';
import overviewShot from '@/public/screenshots/dashboard-overview.png';
import resultsShot from '@/public/screenshots/dashboard-results.png';

/*
  What the product actually looks like.

  ⚠️ THE FIRST THING ON THIS SITE THAT SHOWS THE REAL APP. Everything else is
  illustration and says so: the hero is a drawn story about an assistant citing
  someone (its header comment insists it stays "an illustration of the outcome,
  not a fake product UI"), HowItWorks draws a code editor that has never
  existed, and the generator runs live but on a SAMPLE constant. A visitor
  could read the whole page and never see a screen they would be paying for.

  ⚠️ THESE ARE GENERATED, NOT PASTED IN. Every file here comes out of
  `npm run shots`, which drives app/(dev)/shots — the real workspace components
  rendered against lib/dashboard/seed.ts. Re-run it after any dashboard layout
  change rather than editing these files or replacing them by hand; the whole
  point of the pipeline is that the marketing images cannot quietly rot a year
  behind the product.

  ⚠️ THE NUMBERS ARE A FIXTURE AND THE SECTION SAYS SO OUT LOUD. Summit Roofing
  is not a customer and 3-of-15 citations is not a result anybody got. This
  site's own /about page says plainly that anyone guaranteeing citations is
  selling something, and components/generator/faq-generator.tsx labels its
  sample output "Example" for the same reason. A screenshot full of invented
  metrics presented as somebody's outcome is exactly that failure with better
  art direction — so the line under the heading is not decoration, and it does
  not get cut for brevity.

  Static imports rather than string paths: next/image then knows the intrinsic
  2400x1720 and can generate a blur placeholder, which these earn at ~280KB
  each. It is the first placeholder="blur" on the site.
*/

type Shot = {
  src: StaticImageData;
  /** The screen's own name in the product, so the two vocabularies match. */
  screen: string;
  title: string;
  body: string;
};

/*
  In the order of the loop HowItWorks describes immediately above this section —
  audit, answer, track — with the Overview last as the thing that holds them.
  A visitor reads the five steps and then sees the four screens in the same
  sequence, which is why this section sits where it does.
*/
const SHOTS: Shot[] = [
  {
    src: auditShot,
    screen: 'Your site',
    title: 'What an AI crawler sees when it reads you',
    body: '44 checks across your whole site, scored and sorted so the thing costing you the most sits at the top. Written in plain English, not audit-speak.',
  },
  {
    src: answersShot,
    screen: 'Answers',
    title: 'Answers written to be quoted, page by page',
    body: 'A question with a direct reply underneath — the shape assistants actually lift. Each page of your site gets its own set and its own block of code to paste.',
  },
  {
    src: resultsShot,
    screen: 'Results',
    title: 'Whether the engines have started naming you',
    body: 'We put your questions to ChatGPT, Perplexity and Gemini and record who gets cited. Including, when it is not you, exactly who it was instead.',
  },
  {
    src: overviewShot,
    screen: 'Home',
    title: 'And a short list of what to do next',
    body: 'Not a wall of metrics. The few things that would move your visibility most, in order, with the work each one takes.',
  },
];

export function ProductShots() {
  return (
    <section id="inside" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">Inside FaqFlo</p>
          <h2 className="mt-4 text-[2rem] text-balance sm:text-[2.5rem]">
            Here&rsquo;s what you actually get
          </h2>
          {/* ⚠️ Load-bearing. See the note at the top of this file — without it
              the invented metrics below read as a customer's results. */}
          <p className="text-slate mt-4 text-[1.0625rem] leading-relaxed">
            Real screens from the product, filled with example data for a roofing company that
            doesn&rsquo;t exist.
          </p>
        </div>

        <div className="mt-14 space-y-14 sm:mt-16 sm:space-y-16">
          {SHOTS.map((shot) => (
            <figure key={shot.screen}>
              {/*
                A plain framed panel, deliberately not the navy traffic-light
                chrome from how-it-works.tsx. That idiom means "here is a file",
                it is used by the section directly above this one, and repeating
                it here would make both read as decoration rather than either
                one meaning anything.

                No .grain either: it is a mix-blend-mode overlay on ::after, so
                it would sit on top of the screenshot and tint the UI inside it.
              */}
              <div className="border-line shadow-hero overflow-hidden rounded-2xl border bg-white">
                <Image
                  src={shot.src}
                  /* Not lower-cased: doing that to build one sentence turned
                     "AI" into "ai" in the audit shot's alt text. */
                  alt={`The ${shot.screen} screen in FaqFlo — ${shot.title}`}
                  placeholder="blur"
                  sizes="(min-width: 1152px) 72rem, 100vw"
                  className="w-full"
                />
              </div>

              <figcaption className="mx-auto mt-6 max-w-2xl text-center">
                <p className="text-slate font-mono text-xs tracking-wide uppercase">
                  {shot.screen}
                </p>
                <h3 className="mt-2 text-xl">{shot.title}</h3>
                <p className="text-slate mt-2 text-[1.0625rem] leading-relaxed">{shot.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
