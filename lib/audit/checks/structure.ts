/**
 * Content structure & answerability — is what's here shaped like something an
 * assistant can lift?
 *
 * The distinction this pillar draws: a page can be perfectly crawlable and
 * still be unquotable, because it's written as continuous marketing prose with
 * no question anywhere and no sentence that stands on its own. What gets quoted
 * is a clear question with a short, specific answer directly under it.
 */

import { allPages, type PageSet } from '../fetcher';
import { isQuestion, sentences, type PageFacts } from '../parse';
import type { Finding } from '../types';

const P = 'structure' as const;

/** Words in the paragraph after a question heading, above which it stops
    reading as a direct answer and starts reading as an essay. */
const ANSWER_FIRST_WORDS = 80;

export function structureChecks(set: PageSet): Finding[] {
  const pages = allPages(set);
  const findings: Finding[] = [];

  /* Question-shaped headings --------------------------------------------- */
  {
    const questionHeadings = pages.flatMap((p) =>
      p.facts.headings.filter((h) => isQuestion(h.text)).map((h) => `${h.text} — ${p.finalUrl}`),
    );

    findings.push({
      id: 'question-headings',
      pillar: P,
      label: 'Questions asked as headings',
      status: questionHeadings.length >= 3 ? 'pass' : questionHeadings.length > 0 ? 'warn' : 'fail',
      detail:
        questionHeadings.length >= 3
          ? `${questionHeadings.length} headings across the site are phrased as questions, which is what an assistant matches against.`
          : questionHeadings.length > 0
            ? `Only ${questionHeadings.length} heading is phrased as a question. Assistants match a user's question against your headings, so a handful more is the cheapest win here.`
            : 'No heading anywhere is phrased as a question. An assistant has nothing to match a real question against.',
      weight: 3,
      evidence: questionHeadings.slice(0, 5),
    });
  }

  /* Answer-first writing --------------------------------------------------- */
  {
    let answered = 0;
    let tooLong = 0;
    const examples: string[] = [];

    for (const page of pages) {
      for (const pair of questionAnswerPairs(page.facts)) {
        const words = pair.answer.split(/\s+/).filter(Boolean).length;
        if (words === 0) continue;
        if (words <= ANSWER_FIRST_WORDS) answered += 1;
        else {
          tooLong += 1;
          if (examples.length < 4) examples.push(`${pair.question} — ${words} words before a break`);
        }
      }
    }

    const total = answered + tooLong;
    findings.push(
      total === 0
        ? {
            id: 'answer-first',
            pillar: P,
            label: 'Answers come first',
            status: 'na',
            detail: 'There are no question headings to measure the answers under.',
            weight: 3,
          }
        : {
            id: 'answer-first',
            pillar: P,
            label: 'Answers come first',
            status: answered / total >= 0.7 ? 'pass' : answered > 0 ? 'warn' : 'fail',
            detail:
              answered / total >= 0.7
                ? `${answered} of ${total} questions are answered in a short paragraph directly underneath, which is the form that gets quoted.`
                : `${tooLong} of ${total} questions run into long prose before answering. An assistant lifts the first sentences it finds — make those the answer.`,
            weight: 3,
            evidence: examples,
          },
    );
  }

  /* Paragraph length ------------------------------------------------------- */
  {
    const paragraphs = pages.flatMap((p) => p.facts.paragraphs);
    const long = paragraphs.filter((t) => t.split(/\s+/).length > 120).length;
    findings.push(
      paragraphs.length === 0
        ? {
            id: 'paragraphs',
            pillar: P,
            label: 'Paragraphs are a quotable length',
            status: 'na',
            detail: 'No paragraph text found to measure.',
            weight: 2,
          }
        : {
            id: 'paragraphs',
            pillar: P,
            label: 'Paragraphs are a quotable length',
            status: long / paragraphs.length < 0.15 ? 'pass' : long / paragraphs.length < 0.35 ? 'warn' : 'fail',
            detail:
              long === 0
                ? 'Paragraphs are short enough to be quoted whole.'
                : `${long} of ${paragraphs.length} paragraphs run past 120 words. Long blocks get summarised rather than quoted, and a summary drops your name.`,
            weight: 2,
          },
    );
  }

  /* Sentence length -------------------------------------------------------- */
  {
    const all = pages.flatMap((p) => sentences(p.facts.text));
    const long = all.filter((s) => s.split(/\s+/).length > 35).length;
    findings.push(
      all.length < 5
        ? {
            id: 'sentences',
            pillar: P,
            label: 'Sentences stay direct',
            status: 'na',
            detail: 'Not enough prose here to judge sentence length.',
            weight: 1,
          }
        : {
            id: 'sentences',
            pillar: P,
            label: 'Sentences stay direct',
            status: long / all.length < 0.1 ? 'pass' : long / all.length < 0.25 ? 'warn' : 'fail',
            detail: `${long} of ${all.length} sentences run past 35 words. Shorter sentences survive being extracted on their own.`,
            weight: 1,
          },
    );
  }

  /* Lists and tables -------------------------------------------------------- */
  {
    const structured = pages.reduce((n, p) => n + p.facts.listCount + p.facts.tableCount, 0);
    findings.push({
      id: 'lists',
      pillar: P,
      label: 'Uses lists or tables',
      status: structured >= 2 ? 'pass' : structured === 1 ? 'warn' : 'fail',
      detail:
        structured >= 2
          ? `${structured} lists or tables across the scanned pages. Structured facts are the easiest thing for a machine to lift accurately.`
          : 'Almost no lists or tables. Steps, options and comparisons get quoted far more often when they are marked up as lists.',
      weight: 2,
    });
  }

  /* Specificity ------------------------------------------------------------- */
  {
    // Vague pages don't get quoted, because there's nothing in them worth
    // repeating. Numbers, money and time windows are the cheapest proxy for
    // "this says something concrete".
    const text = pages.map((p) => p.facts.text).join(' ');
    const numbers = (text.match(/\b\d[\d,.]*\b/g) ?? []).length;
    const money = (text.match(/[$£€]\s?\d/g) ?? []).length;
    const durations = (text.match(/\b\d+\s?(hours?|days?|weeks?|months?|years?|minutes?)\b/gi) ?? []).length;
    const signals = numbers + money * 2 + durations * 2;

    findings.push({
      id: 'specificity',
      pillar: P,
      label: 'Answers are specific',
      status: signals >= 25 ? 'pass' : signals >= 8 ? 'warn' : 'fail',
      detail:
        signals >= 25
          ? 'The copy is full of concrete detail — numbers, prices, timeframes — which is what makes an answer worth repeating.'
          : 'Very little concrete detail: few numbers, prices or timeframes. Vague copy rarely gets quoted, because there is nothing specific to quote.',
      weight: 2,
      evidence: [`${numbers} numbers · ${money} prices · ${durations} timeframes`],
    });
  }

  /* Heading hierarchy -------------------------------------------------------- */
  {
    const skips: string[] = [];
    for (const page of pages) {
      let previous = 0;
      for (const h of page.facts.headings) {
        if (previous && h.level > previous + 1) {
          skips.push(`h${previous} → h${h.level} on ${page.finalUrl}`);
        }
        previous = h.level;
      }
    }
    findings.push({
      id: 'hierarchy',
      pillar: P,
      label: 'Heading levels in order',
      status: skips.length === 0 ? 'pass' : skips.length <= 2 ? 'warn' : 'fail',
      detail:
        skips.length === 0
          ? 'Headings step down one level at a time, so the document outline is unambiguous.'
          : `${skips.length} places skip a heading level. The outline is how a machine works out which answer belongs to which question.`,
      weight: 1,
      evidence: skips.slice(0, 4),
    });
  }

  /* Q&A markup --------------------------------------------------------------- */
  {
    const types = new Set(pages.flatMap((p) => p.facts.schemaTypes));
    const hasQa = [...types].some((t) => /^(FAQPage|QAPage|Question)$/.test(t));
    findings.push({
      id: 'qa-markup',
      pillar: P,
      label: 'Questions marked up for machines',
      status: hasQa ? 'pass' : 'fail',
      detail: hasQa
        ? 'Question-and-answer markup is present, so an assistant does not have to guess which text answers what.'
        : 'No question-and-answer markup anywhere. An assistant has to infer which text answers which question, and usually it infers nothing.',
      weight: 3,
    });
  }

  return findings;
}

/**
 * Pair each question heading with the prose that follows it.
 *
 * Approximate by design: without a DOM we can't know exactly which paragraphs
 * sit under which heading, so this uses document order — the text that appears
 * after a question heading and before the next heading. Good enough to tell a
 * short direct answer from three paragraphs of preamble.
 */
function questionAnswerPairs(facts: PageFacts): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = [];
  const text = facts.text;

  for (const heading of facts.headings) {
    if (!isQuestion(heading.text)) continue;

    const at = text.indexOf(heading.text);
    if (at === -1) continue;

    const after = text.slice(at + heading.text.length);
    // Stop at the next heading's text if we can find it, else take a window.
    const nextHeading = facts.headings
      .map((h) => after.indexOf(h.text))
      .filter((i) => i > 0)
      .sort((a, b) => a - b)[0];

    pairs.push({
      question: heading.text,
      answer: after.slice(0, nextHeading ?? 600).trim(),
    });
  }

  return pairs;
}
