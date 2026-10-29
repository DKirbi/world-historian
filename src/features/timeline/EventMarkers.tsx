import { memo } from 'react';
import type { HistEvent } from '@/data/types';
import type { ShownEvent } from '@/lib/events';
import type { TimeScale } from '@/lib/time';
import { truncate } from '@/lib/labels';
import s from './Timeline.module.scss';

interface Props {
  shown: ShownEvent[];
  laneX: number;
  laneW: number;
  scale: TimeScale;
  charW: number;
  /** Event name in the reader's language. */
  nameOf: (e: HistEvent) => string;
  /** The lane is faded back while a story about another country is open. */
  dimmed: boolean;
  /** Lanes this narrow get markers only; labels need room beside the polity names. */
  showLabels: boolean;
  activeId?: string;
  onEnter: (e: HistEvent, ev: React.PointerEvent) => void;
  onLeave: () => void;
  onSelect: (e: HistEvent) => void;
}

const R = 3.5;

/** Key events in one lane: a dot at the start year, a rail for multi-year events, a label when there is room. */
export const EventMarkers = memo(function EventMarkers({
  shown,
  laneX,
  laneW,
  scale,
  charW,
  nameOf,
  dimmed,
  showLabels,
  activeId,
  onEnter,
  onLeave,
  onSelect,
}: Props) {
  const cx = laneX + laneW - 8;
  const maxChars = Math.floor((laneW - 30) / charW);
  return (
    <g className={s.events} data-dimmed={dimmed || undefined}>
      {shown.map(({ event, y, labeled }) => {
        const yEnd = event.to !== undefined ? scale(event.to + 1) : y;
        const active = event.id === activeId;
        return (
          <g
            key={event.id}
            className={s.event}
            data-active={active || undefined}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter(event, e)}
            onPointerLeave={onLeave}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(event);
            }}
          >
            {yEnd - y > 2 * R && <line className={s.eventRail} x1={cx} x2={cx} y1={y} y2={yEnd} />}
            {/* generous invisible hit area so a 7px dot is easy to hover and tap */}
            <rect x={cx - 9} y={y - 9} width={18} height={18} fill="transparent" />
            <circle className={s.eventDot} cx={cx} cy={y} r={active ? R + 1.5 : R} />
            {showLabels && labeled && maxChars >= 6 && (
              <text className={s.eventLabel} x={cx - R - 5} y={y + 4} textAnchor="end">
                {truncate(nameOf(event), maxChars)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});
