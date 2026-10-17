import { useMemo } from 'react';
import type { RegionData } from '@/data/types';
import { groupLabel, regionMeta } from '@/data/regions';
import { formatYear } from '@/lib/format';
import { selectLanes, useTimeline } from '@/state/store';
import { useMediaQuery } from '@/lib/hooks';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { LEVELS, type Level } from '@/lib/levels';
import { PolitySearch } from './PolitySearch';
import { CountryPicker } from './CountryPicker';
import s from './FilterBar.module.scss';

/** One row of controls that scope the chart below. */
export function FilterBar({ region }: { region: RegionData }) {
  const laneFilter = useTimeline((st) => st.laneFilter);
  const level = useTimeline((st) => st.level);
  const cursorYear = useTimeline((st) => st.cursorYear);
  const setLaneFilter = useTimeline((st) => st.setLaneFilter);

  const showEvents = useTimeline((st) => st.showEvents);
  const setShowEvents = useTimeline((st) => st.setShowEvents);
  const hasEvents = useMemo(() => Object.keys(region.events).length > 0, [region.events]);
  const zoomTo = useTimeline((st) => st.zoomTo);
  const openPanel = useTimeline((st) => st.openPanel);

  const narrow = useMediaQuery('(max-width: 719px)');
  const visible = useMemo(() => selectLanes(region.lanes, laneFilter), [region.lanes, laneFilter]);
  const groups = useMemo(() => [...new Set(region.lanes.map((l) => l.group))], [region.lanes]);

  return (
    <div className={s.bar}>
      <div className={s.primary}>
        <PolitySearch region={region} />
        <CountryPicker lanes={region.lanes} visible={visible} />
        <SegmentedControl
          label="Level of detail"
          value={String(level)}
          onChange={(v) => zoomTo({ type: 'level', level: Number(v) as Level })}
          options={LEVELS.map((l) => ({
            value: String(l.level),
            label: l.label,
            title: l.hint,
          }))}
        />
        {hasEvents && (
          <Chip
            pressed={showEvents}
            onClick={() => setShowEvents(!showEvents)}
            title="Battles, wars, treaties and other key events from Wikidata"
          >
            {narrow ? 'Events' : 'Key events'}
          </Chip>
        )}
        <div className={s.zoom} role="group" aria-label="Zoom">
          <IconButton icon="minus" label="Zoom out" onClick={() => zoomTo({ type: 'by', factor: 1 / 1.6 })} />
          <IconButton icon="plus" label="Zoom in" onClick={() => zoomTo({ type: 'by', factor: 1.6 })} />
          <IconButton icon="fit" label="Show all of history" onClick={() => zoomTo({ type: 'reset' })} />
        </div>
        <Button
          icon="list"
          className={s.listButton}
          onClick={() => openPanel({ kind: 'year' })}
          title={`List who held each country in ${formatYear(cursorYear)}`}
          aria-label={`${formatYear(cursorYear)} as a list`}
        >
          {formatYear(cursorYear)} as a list
        </Button>
      </div>
      <div className={s.chips} role="group" aria-label="Show a group of countries">
        <Chip pressed={laneFilter.kind === 'all'} onClick={() => setLaneFilter({ kind: 'all' })}>
          {regionMeta(region.id).allLabel}
        </Chip>
        {groups.map((g) => {
          const pressed = laneFilter.kind === 'group' && laneFilter.group === g;
          return (
            <Chip
              key={g}
              pressed={pressed}
              onClick={() => setLaneFilter(pressed ? { kind: 'all' } : { kind: 'group', group: g })}
            >
              {groupLabel(g)}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
