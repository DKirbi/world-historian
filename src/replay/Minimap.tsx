import { useMemo, useRef, useState, useEffect } from 'react';
import type { Locale } from '@/i18n/locales';
import { createFmt } from '@/i18n/format';
import { warSpan, type Model } from './model';
import type { MinimapSpan, ReplayWar } from './types';

interface Props {
  model: Model;
  lang: Locale;
  year: number;
  current: number;
  activeWar: string | null;
  title: string;
  warsLabel: string;
  onSeek: (year: number) => void;
  onPickEvent: (index: number) => void;
  onPickWar: (id: string) => void;
}

/** Side-by-side columns for overlapping spans, as the chart packs them (first free column wins). */
function pack<T>(items: T[], from: (x: T) => number, to: (x: T) => number, max: number): { item: T; col: number; cols: number }[] {
  const sorted = [...items].sort((a, b) => from(a) - from(b) || to(b) - to(a));
  const ends: number[] = [];
  const placed = sorted.map((item) => {
    let col = ends.findIndex((e) => e < from(item));
    if (col < 0) {
      col = ends.length < max ? ends.length : ends.indexOf(Math.min(...ends));
    }
    ends[col] = to(item);
    return { item, col };
  });
  const cols = Math.max(1, Math.min(max, ends.length));
  return placed.map((p) => ({ ...p, cols }));
}

const TIER_FILL: Record<number, string> = { 1: 'var(--tier-1)', 2: 'var(--tier-2)', 3: 'var(--tier-3)' };

/**
 * The chart, cut down to the countries where the replay's events happened: the same columns, blocks and stone
 * ramp, with Rome in the selection colour, plus a column of the wars. Time runs down, as in the chart. It is the
 * replay's minimap and its scrubber: press or drag anywhere to move the playhead; select a dot to stop on its event.
 */
export function Minimap({ model, lang, year, current, activeWar, title, warsLabel, onSeek, onPickEvent, onPickWar }: Props) {
  const fmt = createFmt(lang);
  const wrap = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(600);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setH(Math.max(240, e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [lo, hi] = model.pack.range;
  const top = 74;
  const bottom = 12;
  const y = (yr: number) => top + ((yr - lo) / (hi + 1 - lo)) * (h - top - bottom);
  const yearAt = (py: number) => lo + ((py - top) / (h - top - bottom)) * (hi + 1 - lo);

  const warW = 92;
  const laneW = 22;
  const gap = 3;
  const lanes = model.pack.minimap;
  const width = warW + gap + lanes.length * (laneW + gap);

  const bars = useMemo(() => pack<ReplayWar>(model.bars, (w) => warSpan(w)[0], (w) => warSpan(w)[1], 4), [model.bars]);
  const lanesPacked = useMemo(
    () => lanes.map((l) => pack<MinimapSpan>(l.spans, (s) => s.from, (s) => s.to + 1, 3)),
    [lanes],
  );
  const barX = new Map(bars.map((b) => [b.item.id, { x: (b.col * warW) / b.cols, w: warW / b.cols }]));

  const ticks: number[] = [];
  for (let t = Math.ceil(lo / 50) * 50; t <= hi; t += 50) ticks.push(t);

  const dragging = useRef(false);
  const seekFrom = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const py = e.clientY - r.top;
    if (py < top - 6) return;
    onSeek(Math.max(lo, Math.min(hi, yearAt(py))));
  };

  return (
    <div className="rp-mini" ref={wrap}>
      <svg
        width={width + 44}
        height={h}
        role="slider"
        aria-label={title}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={Math.floor(year)}
        aria-valuetext={fmt.year(Math.floor(year))}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('[data-pick]')) return;
          dragging.current = true;
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          seekFrom(e);
        }}
        onPointerMove={(e) => dragging.current && seekFrom(e)}
        onPointerUp={() => (dragging.current = false)}
      >
        <g transform="translate(44,0)">
          {/* column heads */}
          <text className="rp-mini__head" x={warW / 2} y={top - 10} textAnchor="middle">
            {warsLabel}
          </text>
          {lanes.map((l, i) => (
            <text
              key={l.lane}
              className="rp-mini__head"
              transform={`translate(${warW + gap + i * (laneW + gap) + laneW / 2 + 4},${top - 8}) rotate(-90)`}
            >
              {((lang === 'sl' && l.sl) || l.label).replace(/ \(.*\)$/, '')}
            </text>
          ))}
          <text x={-42} y={top - 10} className="rp-mini__tick">
            {fmt.eraSuffix(-1)}
          </text>
          {/* year grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={width} y1={y(t)} y2={y(t)} className="rp-mini__grid" />
              <text x={-5} y={y(t) + 3} textAnchor="end" className="rp-mini__tick">
                {-t}
              </text>
            </g>
          ))}
          {/* wars */}
          {bars.map(({ item: w, col, cols }) => {
            const [a, b] = warSpan(w);
            const on = w.id === activeWar;
            return (
              <rect
                key={w.id}
                data-pick
                className={`rp-mini__war${on ? ' is-on' : ''}`}
                x={(col * warW) / cols + 0.5}
                y={y(Math.max(a, lo))}
                width={warW / cols - 1}
                height={Math.max(2, y(Math.min(b, hi + 1)) - y(Math.max(a, lo)))}
                onClick={() => onPickWar(w.id)}
              >
                <title>
                  {(lang === 'sl' && w.sl) || w.label} · {fmt.range(w.start[0], w.end[0])}
                </title>
              </rect>
            );
          })}
          {/* the chart's columns */}
          {lanes.map((l, i) => {
            const x0 = warW + gap + i * (laneW + gap);
            return (
              <g key={l.lane}>
                <rect x={x0} y={top} width={laneW} height={h - top - bottom} className="rp-mini__lane" />
                {lanesPacked[i].map(({ item: s, col, cols }) => (
                  <rect
                    key={`${s.id}${s.from}`}
                    x={x0 + (col * laneW) / cols}
                    y={y(Math.max(s.from, lo))}
                    width={laneW / cols - (cols > 1 ? 0.5 : 0)}
                    height={Math.max(1.5, y(Math.min(s.to + 1, hi + 1)) - y(Math.max(s.from, lo)))}
                    fill={s.id.startsWith('roman-') ? 'var(--sel)' : s.extent === 'unknown' ? 'var(--unmapped)' : TIER_FILL[s.tier]}
                    className="rp-mini__span"
                  >
                    <title>
                      {s.name} · {fmt.range(s.from, s.to)}
                    </title>
                  </rect>
                ))}
              </g>
            );
          })}
          {/* events: in their columns, and on their war */}
          {model.visible.map((i) => {
            const e = model.events[i];
            const cy = y(e.t);
            const on = i === current;
            const past = e.t <= year + 1e-6;
            const xs = e.lanes.map((l) => warW + gap + lanes.findIndex((m) => m.lane === l) * (laneW + gap) + laneW / 2);
            const bx = e.war && barX.get(e.war);
            if (bx) xs.push(bx.x + bx.w / 2);
            return xs.map((cx, k) => (
              <circle
                key={`${e.id}-${k}`}
                data-pick
                cx={cx}
                cy={cy}
                r={on ? 4.5 : 2.6}
                className={`rp-mini__ev${on ? ' is-on' : ''}${past ? ' is-past' : ''}`}
                onClick={() => onPickEvent(i)}
              >
                <title>{(lang === 'sl' && e.sl) || e.label}</title>
              </circle>
            ));
          })}
          {/* playhead */}
          <g className="rp-mini__head-line" transform={`translate(0,${y(year)})`}>
            <line x1={-6} x2={width} y1={0} y2={0} />
            <rect x={-40} y={-8} width={38} height={16} rx={3} />
            <text x={-21} y={4} textAnchor="middle">
              {-Math.floor(year) > 0 ? -Math.floor(year) : Math.floor(year)}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
