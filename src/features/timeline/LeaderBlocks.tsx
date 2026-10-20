import { memo } from 'react';
import type { Span } from '@/data/types';
import type { Segment } from '@/lib/levels';
import type { TimeScale } from '@/lib/time';
import { LINE_H, wrapLabel } from '@/lib/labels';
import { blockColors } from './colors';
import s from './Timeline.module.scss';

interface Props {
  /** Leading runs per lane, indexed by visible lane position. */
  segments: Segment[][];
  first: number;
  last: number;
  laneW: number;
  scale: TimeScale;
  viewH: number;
  charW: number;
  /** Name of a record in the reader's language. */
  nameOf: (span: Span) => string;
  /** The state whose story is open. */
  selectedId: string | null;
  /** Lanes faded back while a story about another country is open. */
  isDimmed: (laneIndex: number, span: Span) => boolean;
  hoveredId?: string;
  onEnter: (span: Span, laneIndex: number, e: React.PointerEvent) => void;
  onLeave: () => void;
  /** Select: open the story of this state, told from this column. */
  onSelect: (seg: Segment, laneIndex: number) => void;
  /** Double-click: zoom one level deeper into it. */
  onZoom: (seg: Segment, laneIndex: number) => void;
}

const overlaps = (a: Segment, from: number, to: number) => a.from <= to && from <= a.to;

/**
 * The Empires level: the leading state or culture of each column, one block per run of years.
 * When neighbouring columns share the same leader, the blocks touch and carry one label across
 * them, so an empire reads as one wide block as on a printed wall chart.
 */
export const LeaderBlocks = memo(function LeaderBlocks({
  segments,
  first,
  last,
  laneW,
  scale,
  viewH,
  charW,
  nameOf,
  selectedId,
  isDimmed,
  hoveredId,
  onEnter,
  onLeave,
  onSelect,
  onZoom,
}: Props) {
  const same = (j: number, seg: Segment, from = seg.from, to = seg.to) =>
    (segments[j] ?? []).some((o) => o.span.id === seg.span.id && overlaps(o, from, to));
  const out: JSX.Element[] = [];
  const labels: JSX.Element[] = []; // drawn after every block, since a label may run across neighbours
  for (let j = first; j <= last; j++) {
    const laneX = j * laneW;
    for (const seg of segments[j] ?? []) {
      const top = scale(seg.from);
      const bottom = scale(seg.to + 1);
      if (bottom < 0 || top > viewH) continue;
      const { span } = seg;
      const leftSame = same(j - 1, seg);
      const rightSame = same(j + 1, seg);
      const x0 = laneX + (leftSame ? 0 : 1);
      const x1 = laneX + laneW - (rightSame ? 0 : 1);
      const h = bottom - top;
      const selected = selectedId === span.id;
      const dimmed = isDimmed(j, span);
      const { fill, ink } = blockColors(span, selected);
      const visTop = Math.max(top, 0);
      const visH = Math.min(bottom, viewH) - visTop;
      // one label per merged run: drawn by its leftmost column, as wide as the run at that height
      const year = Math.max(seg.from, Math.ceil(scale.invert(visTop)));
      if (!same(j - 1, seg, year, year) && visH >= 15) {
        let run = 1;
        while (j + run <= last + 1 && same(j + run, seg, year, year)) run += 1;
        const w = run * laneW;
        const lines = wrapLabel(nameOf(span), Math.floor((w - 12) / charW), Math.min(3, Math.floor((visH - 4) / LINE_H)));
        const y = Math.min(visTop, visTop + visH - lines.length * LINE_H - 4) + 13;
        labels.push(
          <text
            key={`l|${j}|${span.id}|${seg.from}`}
            className={s.blockLabel}
            x={x0 + 6}
            y={y}
            style={{ fill: ink }}
            data-strong={selected ? '' : undefined}
            data-dimmed={dimmed || undefined}
            pointerEvents="none"
          >
            {lines.map((l, i) => (
              <tspan key={i} x={x0 + 6} dy={i ? LINE_H : 0}>
                {l}
              </tspan>
            ))}
          </text>,
        );
      }
      out.push(
        <g
          key={`${j}|${span.id}|${seg.from}`}
          className={s.block}
          data-dimmed={dimmed || undefined}
          onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter(span, j, e)}
          onPointerLeave={onLeave}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(seg, j);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onZoom(seg, j);
          }}
        >
          <rect
            x={x0}
            y={top + (h > 4 ? 1 : 0)}
            width={Math.max(1, x1 - x0)}
            height={Math.max(1, h - (h > 4 ? 2 : 0))}
            style={{ fill }}
          />
          {span.extent === 'unknown' && h > 3 && !leftSame && !rightSame && (
            <rect
              className={s.unmappedEdge}
              x={x0 + 0.6}
              y={top + 1.6}
              width={Math.max(1, x1 - x0 - 1.2)}
              height={Math.max(1, h - 3.2)}
              pointerEvents="none"
            />
          )}
          {hoveredId === span.id && (
            <rect
              className={s.ring}
              x={x0 + 1}
              y={top + 2}
              width={Math.max(1, x1 - x0 - 2)}
              height={Math.max(1, h - 4)}
              pointerEvents="none"
            />
          )}
        </g>,
      );
    }
  }
  return (
    <g>
      {out}
      {labels}
    </g>
  );
});
