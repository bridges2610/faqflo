'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/dashboard/format';
import type { DayPoint } from '@/lib/dashboard/types';

/*
  Daily widget traffic — grouped bars, two series.

  Colour choices are validated, not chosen by eye. The brand's bright cyan
  (#22D3EE) fails both the lightness band and the 3:1 contrast floor against a
  white card, so it is never used as a data mark; teal-ink (#0891B2) is the
  passing step of the same hue. The pair scores ΔE 14.7 deutan / 16.3 normal.

  Its tritan separation (6.7) sits in the band that's only legal with a second,
  non-colour encoding — which is why the series are drawn as separate side-by-side
  bars with a gap rather than stacked or overlaid, a legend is always present, and
  the same numbers are available as a table.

  Views and expands are NOT stacked: an expand happens inside a view, so stacking
  them would draw a total that doesn't exist.
*/

const VIEWS = '#2563EB'; // --color-primary
const EXPANDS = '#0891B2'; // --color-teal-ink

// A viewBox rather than measured pixels: the chart scales with its container
// and stays crisp, and no resize observer is needed to redraw it.
const W = 720;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Round a maximum up to something a person would choose for an axis. */
function niceMax(value: number): number {
  if (value <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}

function shortDate(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(d)}/${Number(m)}`;
}

export function TrafficChart({ daily }: { daily: DayPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const max = niceMax(Math.max(...daily.map((d) => d.views), 1));
  const band = PLOT_W / daily.length;
  // 2px surface gap between the pair, per the mark spec — adjacent fills must
  // never touch or they read as one shape.
  const barW = Math.max(2, (band - 6) / 2 - 1);

  const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;
  const ticks = [0, max / 2, max];

  const active = hovered !== null ? daily[hovered] : null;

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">Daily traffic</h2>
          <p className="text-slate mt-1 text-sm">
            Last {daily.length} days. An expand is someone opening an answer to read it.
          </p>
        </div>

        <button
          onClick={() => setShowTable((v) => !v)}
          className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {/* Legend is always present — with two series, colour alone can't carry
          identity, and the tritan separation makes that stricter still. */}
      <div className="mt-4 flex flex-wrap items-center gap-5">
        {[
          { label: 'Views', color: VIEWS },
          { label: 'Expands', color: EXPANDS },
        ].map((s) => (
          <span key={s.label} className="text-slate flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
      </div>

      {showTable ? (
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily views and expands</caption>
            <thead className="text-slate sticky top-0 bg-white text-left">
              <tr className="border-line border-b">
                <th scope="col" className="py-2 font-medium">
                  Date
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Views
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Expands
                </th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="text-navy py-2 font-mono text-xs">{d.date}</td>
                  <td className="text-navy py-2 text-right tabular-nums">
                    {formatNumber(d.views)}
                  </td>
                  <td className="text-slate py-2 text-right tabular-nums">
                    {formatNumber(d.expands)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-4">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            // Width-driven, no fixed height: a fixed height letterboxes the
            // plot inside a wider card, leaving dead margins either side.
            className="w-full"
            role="img"
            aria-label={`Daily views and expands over the last ${daily.length} days`}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Recessive grid — reference, not decoration */}
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

            {daily.map((d, i) => {
              const x0 = PAD.left + i * band;
              const isHovered = hovered === i;
              return (
                <g key={d.date}>
                  {/* Full-height hit target: the bars are ~9px wide, which is a
                      miserable thing to have to hover precisely. */}
                  <rect
                    x={x0}
                    y={PAD.top}
                    width={band}
                    height={PLOT_H}
                    fill={isHovered ? '#0B1B3A' : 'transparent'}
                    fillOpacity={isHovered ? 0.04 : 0}
                    onMouseEnter={() => setHovered(i)}
                  />
                  <rect
                    x={x0 + 2}
                    y={y(d.views)}
                    width={barW}
                    height={PAD.top + PLOT_H - y(d.views)}
                    rx="3"
                    fill={VIEWS}
                    opacity={hovered === null || isHovered ? 1 : 0.45}
                  />
                  <rect
                    x={x0 + 2 + barW + 2}
                    y={y(d.expands)}
                    width={barW}
                    height={PAD.top + PLOT_H - y(d.expands)}
                    rx="3"
                    fill={EXPANDS}
                    opacity={hovered === null || isHovered ? 1 : 0.45}
                  />
                </g>
              );
            })}

            {/* Baseline sits above the bars' rounded ends so they anchor to it */}
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + PLOT_H}
              y2={PAD.top + PLOT_H}
              stroke="#E2E8F0"
              strokeWidth="1"
            />

            {/* Every seventh day, plus the last — but only when the last is far
                enough from its predecessor not to collide with it. */}
            {daily.map((d, i) =>
              i % 7 === 0 || (i === daily.length - 1 && i % 7 > 2) ? (
                <text
                  key={`label-${d.date}`}
                  x={PAD.left + i * band + band / 2}
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

          {/* Tooltip pinned to a corner rather than following the cursor: at 30
              bands a floating tooltip spends half its life clipped by the card. */}
          <div
            className={`border-line pointer-events-none absolute top-0 right-0 rounded-input border bg-white px-3 py-2 shadow-soft transition-opacity duration-150 ${
              active ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden="true"
          >
            <p className="text-navy font-mono text-xs">{active?.date ?? ''}</p>
            <p className="text-slate mt-1 text-xs">
              <span className="text-navy font-semibold tabular-nums">
                {formatNumber(active?.views ?? 0)}
              </span>{' '}
              views ·{' '}
              <span className="text-navy font-semibold tabular-nums">
                {formatNumber(active?.expands ?? 0)}
              </span>{' '}
              expands
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
