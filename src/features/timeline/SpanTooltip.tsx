import { forwardRef } from 'react';
import type { Era, HistEvent, Span } from '@/data/types';
import type { StackBlock } from '@/lib/pack';
import { useI18n } from '@/i18n/useI18n';
import s from './Timeline.module.scss';

interface Props {
  span: Span;
  /** The country's name in the reader's language. */
  laneLabel: string;
}

/** Hover readout. The years lead; the name and share follow. Positioned by the parent. */
export const SpanTooltip = forwardRef<HTMLDivElement, Props>(function SpanTooltip({ span, laneLabel }, ref) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const country = laneLabel.replace(/\s*\(.*\)$/, '');
  const meta =
    span.extent === 'unknown'
      ? t('tooltip.unmapped', { country, source: span.cited === 'wikipedia' ? 'Wikipedia' : 'Wikidata' })
      : span.inside
        ? t('tooltip.inside', { country })
        : span.large
          ? t('tooltip.large', { country })
          : t('tooltip.share', { share: fmt.share(span.peak ?? 0), country });
  return (
    <div ref={ref} className={s.tooltip} role="presentation">
      <div className={s.ttValue}>{fmt.spanRange(span)}</div>
      <div className={s.ttName}>{i18n.polity(span)}</div>
      <div className={s.ttMeta}>
        {meta}
        {span.km2 ? t('tooltip.area', { area: fmt.area(span.km2) }) : ''}
        {span.realm ? t('tooltip.realm') : ''}
      </div>
      <div className={s.ttHint}>{t('tooltip.select')}</div>
    </div>
  );
});

/** Hover readout for a key event. */
export const EventTooltip = forwardRef<HTMLDivElement, { event: HistEvent }>(function EventTooltip({ event }, ref) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  return (
    <div ref={ref} className={s.tooltip} role="presentation">
      <div className={s.ttValue}>{fmt.eventDate(event)}</div>
      <div className={s.ttName}>{i18n.event(event)}</div>
      <div className={s.ttMeta}>{t('tooltip.eventMeta', { type: t(`event.${event.type}`), n: event.links })}</div>
      <div className={s.ttHint}>{t('tooltip.select')}</div>
    </div>
  );
});

/** Hover readout for an era block: years, name, area and who led it. */
export const EraTooltip = forwardRef<HTMLDivElement, { era: Era; name: string; areaLabel: string | null }>(function EraTooltip(
  { era, name, areaLabel },
  ref,
) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const lead = fmt.list(era.leaders.map((l) => i18n.polity(l)));
  return (
    <div ref={ref} className={s.tooltip} role="presentation">
      <div className={s.ttValue}>{fmt.spanRange(era)}</div>
      <div className={s.ttName}>
        {name}
        {areaLabel ? `, ${areaLabel}` : ''}
      </div>
      {era.leaders.length > 0 && (
        <div className={s.ttMeta}>{t(era.leadersBy === 'source' ? 'tooltip.eraNamed' : 'tooltip.eraLeading', { list: lead })}</div>
      )}
      <div className={s.ttMeta}>{era.cite ? t('tooltip.eraSource', { page: era.cite.page }) : t('tooltip.eraBins')}</div>
      <div className={s.ttHint}>{t('tooltip.selectZoom')}</div>
    </div>
  );
});

/** Hover readout for a "+N" block: how many states, and their names. */
export const StackTooltip = forwardRef<HTMLDivElement, { block: StackBlock; laneLabel: string }>(function StackTooltip(
  { block, laneLabel },
  ref,
) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const names = block.spans.slice(0, 6).map((sp) => i18n.polity(sp));
  return (
    <div ref={ref} className={s.tooltip} role="presentation">
      <div className={s.ttValue}>{fmt.range(block.from, block.to)}</div>
      <div className={s.ttMeta}>
        {t('tooltip.stack', {
          n: block.spans.length,
          country: laneLabel.replace(/\s*\(.*\)$/, ''),
          list: block.spans.length > 6 ? `${names.join(', ')}…` : fmt.list(names),
        })}
      </div>
      <div className={s.ttHint}>{t('tooltip.select')}</div>
    </div>
  );
});
