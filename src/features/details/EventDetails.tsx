import { useMemo } from 'react';
import type { RegionData } from '@/data/types';
import { formatEventDate } from '@/lib/format';
import { EVENT_TYPE_LABEL } from '@/lib/events';
import { useTimeline } from '@/state/store';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import s from './details.module.scss';

const PLACED_BY = {
  coordinates: 'its coordinates on Wikidata',
  location: 'the coordinates of its location on Wikidata',
  country: 'its country on Wikidata',
} as const;

const PRECISION = { 8: 'decade', 7: 'century', 6: 'millennium' } as Record<number, string>;

/** One key event: when, what kind, which countries it is shown in, and where to read more. */
export function EventDetails({ region, id }: { region: RegionData; id: string }) {
  const zoomTo = useTimeline((st) => st.zoomTo);
  const entry = region.events[id];
  const laneById = useMemo(() => new Map(region.lanes.map((l) => [l.id, l])), [region.lanes]);
  if (!entry) return <p className={s.muted}>This event is not in this region’s data.</p>;
  const { event, laneIds } = entry;
  const end = event.to ?? event.year;
  const pad = Math.max(10, Math.round((end - event.year) * 0.3));
  const minLinks = region.cited?.events?.minSitelinks;

  return (
    <>
      <section className={s.section}>
        <div className={s.actions}>
          <Button
            icon="fit"
            onClick={() =>
              zoomTo({
                type: 'years',
                years: [event.year - pad, end + pad],
                laneId: laneIds[0],
              })
            }
          >
            Zoom to its date
          </Button>
        </div>
        <dl className={s.eventFacts}>
          <dt>Date</dt>
          <dd>
            {formatEventDate(event)}
            {event.prec !== undefined && PRECISION[event.prec] && (
              <span className={s.linkMeta}>Wikidata gives this date to the {PRECISION[event.prec]}.</span>
            )}
          </dd>
          <dt>Type</dt>
          <dd>{EVENT_TYPE_LABEL[event.type]}</dd>
          <dt>Shown in</dt>
          <dd>
            {laneIds.map((lid, i) => (
              <span key={lid}>
                {i > 0 && ', '}
                <button
                  type="button"
                  className={s.inlineLink}
                  onClick={() =>
                    zoomTo({
                      type: 'years',
                      years: [event.year - pad, end + pad],
                      laneId: lid,
                    })
                  }
                >
                  {laneById.get(lid)?.label ?? lid}
                </button>
              </span>
            ))}
            <span className={s.linkMeta}>Placed by {PLACED_BY[event.by]}.</span>
          </dd>
          <dt>Known in</dt>
          <dd>Wikipedia articles in {event.links} languages</dd>
        </dl>
      </section>

      <section className={s.section} aria-labelledby="event-refs">
        <h3 id="event-refs" className={s.h3}>
          Read more
        </h3>
        <ul className={s.links}>
          {event.wiki && (
            <li>
              <a
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(event.wiki.replace(/ /g, '_'))}`}
                target="_blank"
                rel="noreferrer"
              >
                Wikipedia: {event.wiki}
                <Icon name="external" size={14} />
              </a>
            </li>
          )}
          <li>
            <a href={`https://www.wikidata.org/wiki/${event.id}`} target="_blank" rel="noreferrer">
              Wikidata: {event.id}
              <Icon name="external" size={14} />
            </a>
          </li>
        </ul>
      </section>

      <section className={s.section}>
        <p className={s.footnote}>
          Key events are Wikidata items classed as battles, sieges, invasions, campaigns, wars, revolutions, rebellions,
          coups, treaties or pandemics
          {minLinks ? ` with Wikipedia articles in at least ${minLinks} languages` : ''}. Where markers would overlap,
          the one with articles in more languages is shown; zoom in to see more.
        </p>
      </section>
    </>
  );
}
