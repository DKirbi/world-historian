import { memo } from 'react';
import type { StackBlock } from '@/lib/pack';
import type { TimeScale } from '@/lib/time';
import s from './Timeline.module.scss';

interface Props {
  stacks: StackBlock[];
  laneX: number;
  laneW: number;
  scale: TimeScale;
  viewH: number;
  /** "+3" and, with room, "3 states" in the reader's language. */
  label: (n: number, long: boolean) => string;
  activeKey?: string;
  dimmed: boolean;
  onEnter: (b: StackBlock, e: React.PointerEvent) => void;
  onLeave: () => void;
  onSelect: (b: StackBlock) => void;
}

export const stackKey = (b: { from: number; to: number }) => `${b.from}|${b.to}`;

/** Several small states of one lane, gathered into one block where they would be too narrow to tap. */
export const StackBlocks = memo(function StackBlocks({
  stacks,
  laneX,
  laneW,
  scale,
  viewH,
  label,
  activeKey,
  dimmed,
  onEnter,
  onLeave,
  onSelect,
}: Props) {
  return (
    <g data-dimmed={dimmed || undefined} className={s.stacks}>
      {stacks.map((b) => {
        const w = laneW / b.cols;
        const x = laneX + b.col * w;
        const top = scale(b.from);
        const bottom = scale(b.to + 1);
        if (bottom < 0 || top > viewH) return null;
        const h = bottom - top;
        const visTop = Math.max(top, 0);
        const visH = Math.min(bottom, viewH) - visTop;
        const long = w >= 64 && visH >= 34;
        return (
          <g
            key={stackKey(b)}
            className={s.stack}
            data-active={activeKey === stackKey(b) || undefined}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter(b, e)}
            onPointerLeave={onLeave}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(b);
            }}
          >
            <rect x={x + 1} y={top + 1} width={Math.max(1, w - 2)} height={Math.max(1, h - 2)} rx={h > 8 ? 3 : 0} />
            {visH >= 15 && (
              <text x={x + w / 2} y={visTop + 14} textAnchor="middle" className={s.stackLabel}>
                {label(b.spans.length, false)}
                {long && (
                  <tspan x={x + w / 2} dy={13} className={s.stackLabelLong}>
                    {label(b.spans.length, true)}
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
