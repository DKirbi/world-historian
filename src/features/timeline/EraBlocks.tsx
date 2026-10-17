import { memo } from 'react';
import type { Era } from '@/data/types';
import type { PlacedEra } from '@/lib/levels';
import type { TimeScale } from '@/lib/time';
import { LINE_H, truncate, wrapLabel } from '@/lib/labels';
import s from './Timeline.module.scss';

interface Props {
  placed: PlacedEra[];
  /** Position of each era within its area, for the alternating tone. */
  toneOf: Map<string, 1 | 2>;
  laneW: number;
  scale: TimeScale;
  viewH: number;
  charW: number;
  hoveredId?: string;
  onEnter: (era: Era, e: React.PointerEvent) => void;
  onLeave: () => void;
  onSelect: (p: PlacedEra) => void;
}

/** The Eras level: one block per culture-area period, spanning that area's columns. */
export const EraBlocks = memo(function EraBlocks({
  placed,
  toneOf,
  laneW,
  scale,
  viewH,
  charW,
  hoveredId,
  onEnter,
  onLeave,
  onSelect,
}: Props) {
  return (
    <g className={s.eras}>
      {placed.map((p) => {
        const { era } = p;
        const runW = (p.last - p.first + 1) * laneW;
        // the share of the columns the period takes over each stretch of its years: all of them, or one
        // slot while other periods of the same columns overlap it
        const box = (sl: PlacedEra['slots'][number]) => {
          const sh = shares(sl.of);
          const before = sh.slice(0, sl.slot).reduce((a, b) => a + b, 0);
          return { x: p.first * laneW + before * runW, w: sh[sl.slot] * runW };
        };
        const { x, w } = box(p.slots[0]);
        const top = scale(era.from);
        // a period ending in the year the next one starts gives that year to the next
        const endYear = p.endsAtNext ? era.to : era.to + 1;
        const bottom = scale(endYear);
        if (bottom < 0 || top > viewH) return null;
        const h = bottom - top;
        const visTop = Math.max(top, 0);
        const visH = Math.min(bottom, viewH) - visTop;
        const maxChars = Math.floor((w - 16) / (charW * 1.12));
        const nameLines = visH >= 18 && maxChars >= 4 ? wrapLabel(era.name, maxChars, visH >= 44 ? 2 : 1) : [];
        const lead = era.leaders.map((l) => l.name).join(' · ');
        const showLead = lead && visH >= 18 + nameLines.length * 15 + 12 && maxChars >= 8;
        const y =
          Math.min(visTop, Math.max(top, visTop + visH - (nameLines.length * 15 + (showLead ? LINE_H : 0)) - 8)) + 16;
        return (
          <g
            key={`${era.id}|${p.first}`}
            className={s.era}
            data-tone={toneOf.get(era.id) ?? 1}
            data-hovered={hoveredId === era.id || undefined}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter(era, e)}
            onPointerLeave={onLeave}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(p);
            }}
          >
            {p.slots.length === 1 ? (
              <rect x={x + 1} y={top + 1} width={Math.max(1, w - 2)} height={Math.max(1, h - 2)} rx={h > 10 ? 4 : 0} />
            ) : (
              <path d={stepped(p, box, scale, endYear)} />
            )}
            {nameLines.length > 0 && (
              <text className={s.eraName} x={x + 9} y={y}>
                {nameLines.map((l, i) => (
                  <tspan key={i} x={x + 9} dy={i ? 15 : 0}>
                    {l}
                  </tspan>
                ))}
                {showLead && (
                  <tspan className={s.eraLead} x={x + 9} dy={15}>
                    {truncate(lead, Math.floor((w - 16) / charW))}
                  </tspan>
                )}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});

/** Outline of a period whose width changes while others overlap it: down the right edge, back up the left. */
function stepped(
  p: PlacedEra,
  box: (sl: PlacedEra['slots'][number]) => { x: number; w: number },
  scale: TimeScale,
  endYear: number,
): string {
  const n = p.slots.length;
  const right: string[] = [];
  const left: string[] = [];
  p.slots.forEach((sl, i) => {
    const { x, w } = box(sl);
    const top = i === 0 ? scale(p.era.from) + 1 : scale(sl.from);
    const bottom = i === n - 1 ? scale(endYear) - 1 : scale(sl.to);
    right.push(`${x + w - 1},${top}`, `${x + w - 1},${bottom}`);
    left.unshift(`${x + 1},${bottom}`, `${x + 1},${top}`);
  });
  return `M${right.join('L')}L${left.join('L')}Z`;
}

/**
 * Shares of the width for `n` overlapping periods, the earlier first. They are uneven on purpose: an
 * even split of a two-column run falls exactly on the column boundary and reads as one period per country.
 */
function shares(n: number): number[] {
  if (n === 1) return [1];
  if (n === 2) return [0.58, 0.42];
  if (n === 3) return [0.45, 0.33, 0.22];
  const w = Array.from({ length: n }, (_, i) => n - i);
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / total);
}
