import type { RegionData } from '@/data/types';
import { formatEventDate, formatRange, formatYear } from '@/lib/format';
import { EVENT_TYPE_LABEL } from '@/lib/events';
import { useTimeline } from '@/state/store';
import { Sheet } from '@/components/ui/Sheet';
import { regionYears } from '@/features/filters/PolitySearch';
import { regionMeta } from '@/data/regions';
import { PolityDetails } from './PolityDetails';
import { YearSnapshot } from './YearSnapshot';
import { SourcesPanel } from './SourcesPanel';
import { EventDetails } from './EventDetails';

/** Hosts whichever side panel is open: a polity, an event, the year list, or sources. */
export function DetailPanel({ region }: { region: RegionData }) {
  const panel = useTimeline((st) => st.panel);
  const cursorYear = useTimeline((st) => st.cursorYear);
  const closePanel = useTimeline((st) => st.closePanel);

  if (panel.kind === 'none') return null;
  const meta = regionMeta(region.id);

  if (panel.kind === 'polity') {
    const p = region.polities[panel.id];
    const years = regionYears(region, panel.id);
    const apps = region.appearances[panel.id] ?? [];
    const n = new Set(apps.map((a) => a.laneId)).size;
    const circa = apps.some((a) => a.span.approx) ? 'c. ' : '';
    return (
      <Sheet
        title={p?.name ?? 'Unknown state'}
        subtitle={
          years
            ? `${circa}${formatRange(years[0], years[1])} ${meta.inLabel}, across ${n} ${n === 1 ? 'country' : 'countries'} of today`
            : undefined
        }
        onClose={closePanel}
        focusKey={`polity-${panel.id}`}
      >
        <PolityDetails region={region} id={panel.id} />
      </Sheet>
    );
  }

  if (panel.kind === 'event') {
    const ev = region.events[panel.id]?.event;
    return (
      <Sheet
        title={ev?.name ?? 'Unknown event'}
        subtitle={ev ? `${EVENT_TYPE_LABEL[ev.type]}, ${formatEventDate(ev)}` : undefined}
        onClose={closePanel}
        focusKey={`event-${panel.id}`}
      >
        <EventDetails region={region} id={panel.id} />
      </Sheet>
    );
  }

  if (panel.kind === 'year') {
    return (
      <Sheet
        title={`${meta.label} in ${formatYear(cursorYear)}`}
        subtitle="Who held each country at the year marker"
        onClose={closePanel}
        focusKey="year"
      >
        <YearSnapshot region={region} />
      </Sheet>
    );
  }

  return (
    <Sheet title="Sources and licence" onClose={closePanel} focusKey="sources">
      <SourcesPanel region={region} />
    </Sheet>
  );
}
