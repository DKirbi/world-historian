import { memo } from 'react';
import type { PlacedSpan } from '@/lib/pack';
import type { TimeScale } from '@/lib/time';
import { LINE_H, wrapLabel } from '@/lib/labels';
import { blockColors } from './colors';
import s from './Timeline.module.scss';

interface Props {
  placed: PlacedSpan;
  laneX: number;
  laneW: number;
  scale: TimeScale;
  viewH: number;
  charW: number;
  /** Name in the reader's language. */
  name: string;
  /** The state whose story is open: painted in the selection colour. */
  selected: boolean;
  ringed: boolean;
  dimmed: boolean;
  onEnter: (p: PlacedSpan, e: React.PointerEvent) => void;
  onLeave: () => void;
  onSelect: (p: PlacedSpan) => void;
}

/** One polity's span in one lane: a block, its vassal hatch, and a label that stays in view. */
export const SpanBlock = memo(function SpanBlock({
  placed,
  laneX,
  laneW,
  scale,
  viewH,
  charW,
  name,
  selected,
  ringed,
  dimmed,
  onEnter,
  onLeave,
  onSelect,
}: Props) {
  const { span, col, cols } = placed;
  const w = laneW / cols;
  const x = laneX + col * w;
  const top = scale(span.from);
  const bottom = scale(span.to + 1);
  const h = bottom - top;
  const gy = h > 4 ? 1 : 0;
  const gx = w > 6 ? 1 : 0;
  const rx = h > 8 && w > 8 ? 3 : 0;
  const { fill, ink } = blockColors(span, selected);

  // Label sits at the top of the visible part of the block, so long spans stay named while scrolling.
  const visTop = Math.max(top, 0);
  const visBottom = Math.min(bottom, viewH);
  const visH = visBottom - visTop;
  let label: JSX.Element | null = null;
  if (w >= 30 && visH >= 15) {
    const lines = wrapLabel(name, Math.floor((w - 10) / charW), Math.min(3, Math.floor((visH - 4) / LINE_H)));
    const y = Math.min(visTop, visBottom - lines.length * LINE_H - 4) + 13;
    label = (
      <text className={s.blockLabel} x={x + 6} y={y} style={{ fill: ink }} data-strong={selected ? '' : undefined}>
        {lines.map((l, i) => (
          <tspan key={i} x={x + 6} dy={i ? LINE_H : 0}>
            {l}
          </tspan>
        ))}
      </text>
    );
  } else if (w >= 14 && visH >= 72) {
    const [line] = wrapLabel(name, Math.floor((visH - 12) / charW), 1);
    const cx = x + w / 2 - 4;
    const cy = visTop + 6;
    label = line ? (
      <text className={s.blockLabel} transform={`translate(${cx},${cy}) rotate(90)`} style={{ fill: ink }}>
        {line}
      </text>
    ) : null;
  }

  return (
    <g
      className={s.block}
      data-dimmed={dimmed || undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter(placed, e)}
      onPointerLeave={onLeave}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(placed);
      }}
    >
      <rect
        x={x + gx}
        y={top + gy}
        width={Math.max(1, w - 2 * gx)}
        height={Math.max(1, h - 2 * gy)}
        rx={rx}
        style={{ fill }}
      />
      {span.realm && h > 3 && (
        <rect
          x={x + gx}
          y={top + gy}
          width={Math.max(1, w - 2 * gx)}
          height={Math.max(1, h - 2 * gy)}
          rx={rx}
          fill="url(#wht-hatch)"
          pointerEvents="none"
        />
      )}
      {span.extent === 'unknown' && h > 3 && (
        <rect
          className={s.unmappedEdge}
          x={x + gx + 0.6}
          y={top + gy + 0.6}
          width={Math.max(1, w - 2 * gx - 1.2)}
          height={Math.max(1, h - 2 * gy - 1.2)}
          rx={rx}
          pointerEvents="none"
        />
      )}
      {ringed && (
        <rect
          className={s.ring}
          x={x + gx + 1}
          y={top + gy + 1}
          width={Math.max(1, w - 2 * gx - 2)}
          height={Math.max(1, h - 2 * gy - 2)}
          rx={rx}
          pointerEvents="none"
        />
      )}
      {label}
    </g>
  );
});
