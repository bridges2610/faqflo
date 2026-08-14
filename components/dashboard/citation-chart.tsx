'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ENGINES, type CitationDay, type Engine } from '@/lib/dashboard/types';
import { SectionTitle } from './section-title';

/*
  Citations per engine over time.

  FORM: lines, not bars. Three series across thirty days would be ninety bars in
  a card this wide — about six pixels each. Change-over-time with a handful of
  series is what a line chart is for.

  COLOUR: validated, and the ORDER IS LOAD-BearING. Blue → teal → violet passes
  every check; violet placed next to blue fails catastrophically (ΔE 0.4 for
  deuteranopia — the two are the same colour to a red-green colourblind reader).
  Teal sits between them and keeps every adjacent pair separable. Assign by
  engine, never by rank, so a busy week can't repaint the chart.

  Blue↔teal separate at ΔE 6.7 under tritanopia, which is the band that's only
  legal alongside a second, non-colour encoding — hence the direct labels at the
  end of each line, the always-present legend, and the table view.
*/

const SERIES: Record<Engine, string> = {
  ChatGPT: '#2563EB', // --color-primary
  Perplexity: '#0891B2', // --color-teal-ink
  'Google AIO': '#7C3AED',
};

const W = 720;
const H = 240;
const PAD = { top: 14, right: 92, bottom: 24, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function niceMax(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}

function shortDate(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(d)}/${Number(m)}`;
}

export function CitationChart({ daily }: { daily: CitationDay[] }) {
  const [showTable, setShowTable] = useState(false);

  const max = niceMax(
    Math.max(1, ...daily.flatMap((d) => ENGINES.map((e) => d.byEngine[e] ?? 0))),
  );
  const stepX = daily.length > 1 ? PLOT_W / (daily.length - 1) : 0;

  const x = (i: number) => PAD.left + i * stepX;
  const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;
  const ticks = [0, max / 2, max];

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle>Citations over time</SectionTitle>
          <p className="text-slate mt-1 text-sm">
            Questions where your domain was named as a source, per engine, over the last{' '}
            {daily.length} days.
          </p>
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5">
        {ENGINES.map((engine) => (
          <span key={engine} className="text-slate flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SERIES[engine] }}
              aria-hidden="true"
            />
            {engine}
          </span>
        ))}
      </div>

      {showTable ? (
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily citations per engine</caption>
            <thead className="text-slate sticky top-0 bg-white text-left">
              <tr className="border-line border-b">
                <th scope="col" className="py-2 font-medium">
                  Date
                </th>
                {ENGINES.map((e) => (
                  <th key={e} scope="col" className="py-2 text-right font-medium">
                    {e}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="text-navy py-2 font-mono text-xs">{d.date}</td>
                  {ENGINES.map((e) => (
                    <td key={e} className="text-navy py-2 text-right tabular-nums">
                      {d.byEngine[e] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-4 w-full"
          role="img"
          aria-label={`Citations per engine over the last ${daily.length} days`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="#E2E8F0"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-slate"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {t}
              </text>
            </g>
          ))}

          {ENGINES.map((engine) => {
            const points = daily.map((d, i) => `${x(i)},${y(d.byEngine[engine] ?? 0)}`);
            const last = daily[daily.length - 1];
            return (
              <g key={engine}>
                <polyline
                  points={points.join(' ')}
                  fill="none"
                  stroke={SERIES[engine]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* End marker plus a direct label: identity never rests on
                    colour alone, which the tritan separation makes mandatory. */}
                <circle
                  cx={x(daily.length - 1)}
                  cy={y(last?.byEngine[engine] ?? 0)}
                  r="4"
                  fill={SERIES[engine]}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                <text
                  x={x(daily.length - 1) + 10}
                  y={y(last?.byEngine[engine] ?? 0) + 4}
                  className="fill-slate"
                  fontSize="11"
                >
                  {engine}
                </text>
              </g>
            );
          })}

          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
            stroke="#E2E8F0"
            strokeWidth="1"
          />

          {daily.map((d, i) =>
            i % 7 === 0 || (i === daily.length - 1 && i % 7 > 2) ? (
              <text
                key={d.date}
                x={x(i)}
                y={H - 6}
                textAnchor="middle"
                className="fill-slate"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {shortDate(d.date)}
              </text>
            ) : null,
          )}
        </svg>
      )}
    </Card>
  );
}
