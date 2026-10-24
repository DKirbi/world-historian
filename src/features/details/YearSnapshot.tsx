import { useMemo, type CSSProperties } from 'react';
import type { RegionData } from '@/data/types';
import { filterByDetail, spansAt } from '@/lib/spans';
import { TIME_MAX, TIME_MIN } from '@/lib/time';
import { selectLanes, useTimeline } from '@/state/store';
import { useI18n } from '@/i18n/useI18n';
import { groupName } from '@/i18n/regionText';
import { IconButton } from '@/components/ui/Button';
import { blockColors } from '@/features/timeline/colors';
import s from './details.module.scss';

/** Table view of the chart at the year marker: every visible country and who held it. */
export function YearSnapshot({ region }: { region: RegionData }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const cursorYear = useTimeline((st) => st.cursorYear);
  const setCursorYear = useTimeline((st) => st.setCursorYear);
  const laneFilter = useTimeline((st) => st.laneFilter);
  const level = useTimeline((st) => st.level);
  const openStory = useTimeline((st) => st.openStory);
  const lanes = useMemo(() => selectLanes(region.lanes, laneFilter), [region.lanes, laneFilter]);

  const step = (d: number) => setCursorYear(Math.min(TIME_MAX, Math.max(TIME_MIN, cursorYear + d)));

  return (
    <>
      <div className={s.stepper} role="group" aria-label={t('year.stepper')}>
        <IconButton icon="minus" label={t('year.earlier')} onClick={() => step(-100)} variant="default" />
        <label className={s.yearField}>
          <span className="sr-only">{t('year.field')}</span>
          <input
            id="snapshot-year"
            type="number"
            inputMode="numeric"
            min={TIME_MIN}
            max={TIME_MAX}
            value={cursorYear}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setCursorYear(Math.min(TIME_MAX, Math.max(TIME_MIN, Math.round(v))));
            }}
          />
        </label>
        <IconButton icon="plus" label={t('year.later')} onClick={() => step(100)} variant="default" />
      </div>
      <p className={s.footnote}>{t('year.help')}</p>

      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">{t('year.country')}</th>
            <th scope="col">{t('year.heldBy')}</th>
          </tr>
        </thead>
        <tbody>
          {lanes.map((lane, i) => {
            const spans = spansAt(filterByDetail(region.spansByLane[lane.id] ?? [], level >= 4 ? 'all' : 'major'), cursorYear);
            const newGroup = i === 0 || lanes[i - 1].group !== lane.group;
            return (
              <tr key={lane.id} data-group-start={newGroup || undefined}>
                <th scope="row">
                  {newGroup && <span className={s.groupTag}>{groupName(i18n, lane.group)}</span>}
                  {i18n.lane(lane)}
                </th>
                <td>
                  {spans.length === 0 && <span className={s.muted}>{t('year.none')}</span>}
                  <ul className={s.holders}>
                    {spans.map((sp) => (
                      <li key={`${sp.id}-${sp.from}`}>
                        <span
                          className={s.swatch}
                          style={{ '--swatch': blockColors(sp).fill } as CSSProperties}
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          className={s.inlineLink}
                          onClick={() => openStory({ kind: 'polity', id: sp.id, lane: lane.id })}
                        >
                          {i18n.polity(sp)}
                        </button>
                        <span className={s.share}>{fmt.spanShare(sp)}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
