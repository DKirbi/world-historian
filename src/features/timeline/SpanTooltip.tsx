import { forwardRef } from 'react';
import type { Era, HistEvent, Span } from '@/data/types';
import { formatArea, formatEventDate, formatShare, formatSpanRange } from '@/lib/format';
import { EVENT_TYPE_LABEL } from '@/lib/events';
import s from './Timeline.module.scss';

interface Props {
  span: Span;
  laneLabel: string;
}

/** Hover readout. The years lead; the name and share follow. Positioned by the parent. */
export const SpanTooltip = forwardRef<HTMLDivElement, Props>(function SpanTooltip({ span, laneLabel }, ref) {
  const country = laneLabel.replace(/\s*\(.*\)$/, '');
  return (
    <div ref={ref} className={s.tooltip} role="presentation">
      <div className={s.ttValue}>{formatSpanRange(span)}</div>
      <div className={s.ttName}>{span.name}</div>
      <div className={s.ttMeta}>
        {span.extent === 'unknown' ? (
          <>
            Territory not mapped; placed in today’s {country}. Dates from{' '}
            {span.cited === 'wikipedia' ? 'Wikipedia' : 'Wikidata'}
          </>
        ) : span.inside ? (
          <>Lay mostly within today’s {country}</>
        ) : span.large ? (
          <>Held a large area of today’s {country}</>
        ) : (
          <>
            Held up to {formatShare(span.peak ?? 0)} of today’s {country}
          </>
        )}
        {span.km2 ? ` (about ${formatArea(span.km2)})` : ''}
        {span.realm ? ', counting its vassal states' : ''}
      </div>
    </div>
  );
});

/** Hover readout for a key event. */
export const EventTooltip = forwardRef<HTMLDivElement, { event: HistEvent }>(function EventTooltip({ event }, ref) {
  return (
    <div ref={ref} className={s.tooltip} role="presentation">
      <div className={s.ttValue}>{formatEventDate(event)}</div>
      <div className={s.ttName}>{event.name}</div>
      <div className={s.ttMeta}>
        {EVENT_TYPE_LABEL[event.type]} · Wikipedia in {event.links} languages
      </div>
    </div>
  );
});

/** Hover readout for an era block: years, name, area and who led it. */
export const EraTooltip = forwardRef<HTMLDivElement, { era: Era; areaLabel: string | null }>(function EraTooltip(
  { era, areaLabel },
  ref,
) {
  const lead = era.leaders.map((l) => l.name).join(', ');
  return (
    <div ref={ref} className={s.tooltip} role="presentation">
      <div className={s.ttValue}>{formatSpanRange(era)}</div>
      <div className={s.ttName}>
        {era.name}
        {areaLabel ? ` · ${areaLabel}` : ''}
      </div>
      {lead && (
        <div className={s.ttMeta}>
          {era.leadersBy === 'source' ? 'Named by the source: ' : 'Leading in the data: '}
          {lead}
        </div>
      )}
      <div className={s.ttMeta}>
        {era.cite ? `Source: Wikipedia, “${era.cite.page}”` : 'Region period (editorial bins)'} · tap to zoom in
      </div>
    </div>
  );
});
