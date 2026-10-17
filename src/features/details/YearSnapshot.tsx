import { useMemo, type CSSProperties } from 'react';
import type { RegionData } from '@/data/types';
import { groupLabel } from '@/data/regions';
import { formatSpanShare } from '@/lib/format';
import { filterByDetail, spansAt } from '@/lib/spans';
import { TIME_MAX, TIME_MIN } from '@/lib/time';
import { selectLanes, useTimeline } from '@/state/store';
import { IconButton } from '@/components/ui/Button';
import { blockColors } from '@/features/timeline/colors';
import s from './details.module.scss';

/** Table view of the chart at the year marker: every visible country and who held it. */
export function YearSnapshot({ region }: { region: RegionData }) {
  const cursorYear = useTimeline((st) => st.cursorYear);
  const setCursorYear = useTimeline((st) => st.setCursorYear);
  const laneFilter = useTimeline((st) => st.laneFilter);
  const level = useTimeline((st) => st.level);
  const highlights = useTimeline((st) => st.highlights);
  const selectPolity = useTimeline((st) => st.selectPolity);
  const slotOf = useMemo(() => new Map(highlights.map((h) => [h.id, h.slot])), [highlights]);
  const lanes = useMemo(() => selectLanes(region.lanes, laneFilter), [region.lanes, laneFilter]);

  const step = (d: number) => setCursorYear(Math.min(TIME_MAX, Math.max(TIME_MIN, cursorYear + d)));

  return (
    <>
      <div className={s.stepper} role="group" aria-label="Move the year marker">
        <IconButton icon="minus" label="100 years earlier" onClick={() => step(-100)} variant="default" />
        <label className={s.yearField}>
          <span className="sr-only">Year (negative for BCE)</span>
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
        <IconButton icon="plus" label="100 years later" onClick={() => step(100)} variant="default" />
      </div>
      <p className={s.footnote}>
        Use negative numbers for years BCE. Percentages are the largest share each state held of today’s country during
        that span. “Not mapped” marks states the map source does not cover.
      </p>

      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">Country today</th>
            <th scope="col">Held by</th>
          </tr>
        </thead>
        <tbody>
          {lanes.map((lane, i) => {
            const spans = spansAt(
              filterByDetail(region.spansByLane[lane.id] ?? [], level >= 4 ? 'all' : 'major'),
              cursorYear,
            );
            const newGroup = i === 0 || lanes[i - 1].group !== lane.group;
            return (
              <tr key={lane.id} data-group-start={newGroup || undefined}>
                <th scope="row">
                  {newGroup && <span className={s.groupTag}>{groupLabel(lane.group)}</span>}
                  {lane.label}
                </th>
                <td>
                  {spans.length === 0 && <span className={s.muted}>No state in the data</span>}
                  <ul className={s.holders}>
                    {spans.map((sp) => (
                      <li key={`${sp.id}-${sp.from}`}>
                        <span
                          className={s.swatch}
                          style={
                            {
                              '--swatch': blockColors(sp, slotOf.get(sp.id)).fill,
                            } as CSSProperties
                          }
                          aria-hidden="true"
                        />
                        <button type="button" className={s.inlineLink} onClick={() => selectPolity(sp.id)}>
                          {sp.name}
                        </button>
                        <span className={s.share}>{formatSpanShare(sp)}</span>
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
