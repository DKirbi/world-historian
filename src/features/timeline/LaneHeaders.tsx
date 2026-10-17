import type { CSSProperties } from 'react';
import type { Era, Lane, Span, Year } from '@/data/types';
import { groupLabel } from '@/data/regions';
import { spansAt } from '@/lib/spans';
import type { HighlightSlot } from '@/state/store';
import { blockColors } from './colors';
import s from './Timeline.module.scss';

interface Props {
  lanes: Lane[];
  spansByLane: Record<string, Span[]>;
  laneW: number;
  tx: number;
  left: number;
  width: number;
  groupH: number;
  headH: number;
  cursorYear: Year;
  slotOf: Map<string, HighlightSlot>;
  onSelect: (polityId: string, laneId: string) => void;
  /** At the Eras level, each head names the period of its column at the year marker instead. */
  eraFor?: (laneId: string) => Era | undefined;
  onEra?: (era: Era, laneId: string) => void;
}

/**
 * Column heads: lane groups on top, then each country with the polity that held
 * most of it at the year marker. Sweeping the marker is how countries are compared.
 */
export function LaneHeaders({
  lanes,
  spansByLane,
  laneW,
  tx,
  left,
  width,
  groupH,
  headH,
  cursorYear,
  slotOf,
  onSelect,
  eraFor,
  onEra,
}: Props) {
  const groups: Array<{ id: string; start: number; count: number }> = [];
  lanes.forEach((l, i) => {
    const last = groups[groups.length - 1];
    if (last && last.id === l.group) last.count += 1;
    else groups.push({ id: l.group, start: i, count: 1 });
  });

  return (
    <div className={s.headers} style={{ left, width, height: groupH + headH }}>
      <div
        className={s.headersInner}
        style={{
          width: laneW * lanes.length,
          transform: `translateX(${tx}px)`,
        }}
      >
        <div className={s.groupRow} style={{ height: groupH }}>
          {groups.map((g) => (
            <div
              key={`${g.id}-${g.start}`}
              className={s.group}
              style={{
                left: g.start * laneW,
                width: g.count * laneW,
                // keep the group name in view while its lanes are partly scrolled off
                paddingLeft: 8 + Math.max(0, Math.min(-tx - g.start * laneW, g.count * laneW - 90)),
              }}
            >
              <span>{groupLabel(g.id)}</span>
            </div>
          ))}
        </div>
        <div className={s.laneRow} style={{ height: headH }}>
          {lanes.map((lane, i) => {
            const era = eraFor?.(lane.id);
            const [ruler, ...others] = eraFor ? [] : spansAt(spansByLane[lane.id] ?? [], cursorYear);
            const colors = ruler ? blockColors(ruler, slotOf.get(ruler.id)) : null;
            return (
              <div key={lane.id} className={s.lane} style={{ left: i * laneW, width: laneW }}>
                <div
                  className={s.laneName}
                  title={
                    lane.naturalEarth && lane.naturalEarth.length > 1
                      ? `${lane.label}: ${lane.naturalEarth.join(', ')}`
                      : lane.label
                  }
                >
                  {lane.label}
                </div>
                {eraFor ? (
                  era ? (
                    <button
                      type="button"
                      className={s.ruler}
                      onClick={() => onEra?.(era, lane.id)}
                      title={`${era.name}${era.leaders.length ? `: ${era.leaders.map((l) => l.name).join(', ')}` : ''}`}
                    >
                      <span
                        className={s.rulerSwatch}
                        style={{ '--swatch': 'var(--era-2)' } as CSSProperties}
                        aria-hidden="true"
                      />
                      <span className={s.rulerName}>{era.name}</span>
                    </button>
                  ) : (
                    <div className={s.rulerNone} title="No period of this column is recorded in this year">
                      No era recorded
                    </div>
                  )
                ) : ruler ? (
                  <button
                    type="button"
                    className={s.ruler}
                    onClick={() => onSelect(ruler.id, lane.id)}
                    title={`${ruler.name}${others.length ? ` and ${others.length} more` : ''}`}
                  >
                    <span
                      className={s.rulerSwatch}
                      style={{ '--swatch': colors!.fill } as CSSProperties}
                      aria-hidden="true"
                    />
                    <span className={s.rulerName}>{ruler.name}</span>
                    {others.length > 0 && <span className={s.rulerMore}>+{others.length}</span>}
                  </button>
                ) : (
                  <div className={s.rulerNone} title="The source data maps no state here in this year">
                    No state in the data
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
