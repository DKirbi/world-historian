import type { CSSProperties } from 'react';
import type { Era, Lane, Span, Year } from '@/data/types';
import { spansAt } from '@/lib/spans';
import { useI18n } from '@/i18n/useI18n';
import { groupName } from '@/i18n/regionText';
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
  /** The state whose story is open. */
  selectedId: string | null;
  /** The column the open story is told from. */
  focusLaneId?: string;
  eraName: (era: Era) => string;
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
  selectedId,
  focusLaneId,
  eraName,
  onSelect,
  eraFor,
  onEra,
}: Props) {
  const i18n = useI18n();
  const { t } = i18n;
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
              <span>{groupName(i18n, g.id)}</span>
            </div>
          ))}
        </div>
        <div className={s.laneRow} style={{ height: headH }}>
          {lanes.map((lane, i) => {
            const era = eraFor?.(lane.id);
            const [ruler, ...others] = eraFor ? [] : spansAt(spansByLane[lane.id] ?? [], cursorYear);
            const colors = ruler ? blockColors(ruler, selectedId === ruler.id) : null;
            const name = i18n.lane(lane);
            const rulerName = ruler ? i18n.polity(ruler) : '';
            return (
              <div
                key={lane.id}
                className={s.lane}
                data-focus={focusLaneId === lane.id || undefined}
                style={{ left: i * laneW, width: laneW }}
              >
                <div
                  className={s.laneName}
                  title={lane.naturalEarth && lane.naturalEarth.length > 1 ? `${name}: ${lane.naturalEarth.join(', ')}` : name}
                >
                  {name}
                </div>
                {eraFor ? (
                  era ? (
                    <button
                      type="button"
                      className={s.ruler}
                      onClick={() => onEra?.(era, lane.id)}
                      title={`${eraName(era)}${era.leaders.length ? `: ${i18n.fmt.list(era.leaders.map((l) => i18n.polity(l)))}` : ''}`}
                    >
                      <span
                        className={s.rulerSwatch}
                        style={{ '--swatch': 'var(--era-2)' } as CSSProperties}
                        aria-hidden="true"
                      />
                      <span className={s.rulerName}>{eraName(era)}</span>
                    </button>
                  ) : (
                    <div className={s.rulerNone} title={t('timeline.noEraTitle')}>
                      {t('timeline.noEra')}
                    </div>
                  )
                ) : ruler ? (
                  <button
                    type="button"
                    className={s.ruler}
                    onClick={() => onSelect(ruler.id, lane.id)}
                    title={others.length ? t('timeline.andMore', { name: rulerName, n: others.length }) : rulerName}
                  >
                    <span
                      className={s.rulerSwatch}
                      style={{ '--swatch': colors!.fill } as CSSProperties}
                      aria-hidden="true"
                    />
                    <span className={s.rulerName}>{rulerName}</span>
                    {others.length > 0 && <span className={s.rulerMore}>+{others.length}</span>}
                  </button>
                ) : (
                  <div className={s.rulerNone} title={t('timeline.noStateTitle')}>
                    {t('timeline.noState')}
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
