import { useMemo, type ReactNode } from 'react';
import type { Cite, CitedDate, CultureInfo, Era, Polity, RegionData } from '@/data/types';
import type { I18n, MessageKey } from '@/i18n/i18n';
import { useI18n } from '@/i18n/useI18n';
import { useTimeline } from '@/state/store';
import { Icon } from '@/components/ui/Icon';
import s from '@/features/details/details.module.scss';

/**
 * "Behind the record": how the chart placed and dated a record, in the data's own terms. These are
 * the old detail panels, kept whole under each story so nothing the data build records is lost.
 */

const wikipediaUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const wikidataUrl = (id: string) => `https://www.wikidata.org/wiki/${id}`;

/** A quotation with a link to the exact revision it was read from. Quotations stay in their own language. */
function Quote({ c }: { c: Cite }) {
  const { quote, locale } = useI18n();
  return (
    <>
      <span lang={locale === 'en' ? undefined : 'en'}>{quote(c.quote)}</span> —{' '}
      <a href={c.permalink} target="_blank" rel="noreferrer">
        {c.page}
      </a>
    </>
  );
}

const placedBy = (i18n: I18n, by: string) => i18n.tx(`placedBy.${by}`, by);

function CultureSection({ info, laneLabel }: { info: CultureInfo; laneLabel: (id: string) => string }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const { dates, place } = info;
  const pages = [...new Map(info.listed.map((c) => [c.page, c])).values()];
  return (
    <section className={s.section}>
      <h4 className={s.h3}>{t('record.datesPlace')}</h4>
      <p className={s.note}>{t('record.cultureIntro')}</p>
      <ul className={s.notes}>
        <li>
          {dates.by === 'list' && dates.cite?.length ? (
            <>
              {t('record.cultureDatesList', { approx: dates.approx ? 'yes' : 'no' })}{' '}
              {dates.cite.map((c, i) => (
                <span key={i}>
                  {i > 0 && '; '}
                  <Quote c={c} />
                </span>
              ))}
            </>
          ) : dates.by === 'wikidata' && dates.wd ? (
            t('record.cultureDatesWikidata', { from: fmt.wdTime(dates.wd[0]), to: fmt.wdTime(dates.wd[1]) })
          ) : (
            <>
              {t('record.cultureDatesPeriod', { n: dates.cite?.length ?? 1 })}{' '}
              {dates.cite?.map((c, i) => (
                <span key={i}>
                  {i > 0 && '; '}
                  <Quote c={c} />
                </span>
              ))}
            </>
          )}
        </li>
        <li>
          {t('record.cultureShown', { lanes: fmt.list(place.lanes.map(laneLabel)), by: placedBy(i18n, place.by) })}
          {place.by === 'list' && place.text ? <>: {i18n.quote(place.text)}</> : null}
          {place.by === 'list-country' && place.text ? <>: {place.text}</> : null}
          {place.by === 'article' && place.quote ? (
            <>
              : {i18n.quote(place.quote)} —{' '}
              <a href={place.permalink ?? undefined} target="_blank" rel="noreferrer">
                {place.article}
              </a>
            </>
          ) : null}
          .
        </li>
        <li>
          {t('record.cultureListed')}{' '}
          {pages.map((c, i) => (
            <span key={c.page}>
              {i > 0 && ', '}
              <a href={c.permalink} target="_blank" rel="noreferrer">
                {c.page}
              </a>
            </span>
          ))}
          .
        </li>
      </ul>
    </section>
  );
}

function CitedYear({ edge, d }: { edge: 'start' | 'end'; d: CitedDate }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const label = t(edge === 'start' ? 'record.start' : 'record.end');
  if (d.ongoing) return <li>{t('record.stillExists', { label })}</li>;
  const year = d.wd ? fmt.wdTime(d.wd) : d.year === undefined ? '?' : `${d.approx ? fmt.approx : ''}${fmt.year(d.year)}`;
  return (
    <li>
      {label}: <strong>{year}</strong>
      {d.source === 'wikidata' ? (
        <>
          {' (Wikidata)'}
          {d.wd &&
            d.year !== undefined &&
            t('record.wdChartUses', {
              year: fmt.year(d.year),
              edge,
              unit: d.wd[1] === 8 ? 'decade' : d.wd[1] === 7 ? 'century' : 'millennium',
            })}
        </>
      ) : d.source ? (
        <>
          {' '}
          <a href={d.source} target="_blank" rel="noreferrer">
            {t('record.fromWikipedia')}
          </a>
          {d.quote && <>: {i18n.quote(d.quote)}</>}
        </>
      ) : null}
    </li>
  );
}

function WikidataLine({ polity }: { polity: Polity }) {
  const { t, fmt, quote } = useI18n();
  const wd = polity.wd;
  if (!wd) {
    return polity.wikidata ? (
      <li>
        <a href={wikidataUrl(polity.wikidata)} target="_blank" rel="noreferrer">
          {t('record.wikidataLink', { label: polity.wikidata })}
          <Icon name="external" size={14} />
        </a>
      </li>
    ) : null;
  }
  const dates = wd.start || wd.end ? `${fmt.wdTime(wd.start)} – ${wd.end ? fmt.wdTime(wd.end) : t('record.today')}` : null;
  const srcLabel = wd.sourceLabel ? `, ${quote(wd.sourceLabel)}` : '';
  if (!wd.id) {
    return <li className={s.muted}>{t('record.wdHidden', { id: wd.sourceId ?? '', label: srcLabel, dates: dates ? `, ${dates}` : '' })}</li>;
  }
  return (
    <li>
      <a href={wikidataUrl(wd.id)} target="_blank" rel="noreferrer">
        {t('record.wikidataLink', { label: wd.label ?? wd.id })}
        <Icon name="external" size={14} />
      </a>
      {dates && <span className={s.linkMeta}>{t('record.wdDates', { dates })}</span>}
      {wd.status === 'corrected' && (
        <span className={s.linkMeta}>{t('record.wdCorrected', { id: wd.sourceId ?? '', label: wd.sourceLabel ? ` (${quote(wd.sourceLabel)})` : '' })}</span>
      )}
    </li>
  );
}

/** Plain-language reading of the review flags written by the data build. */
function describeFlag(i18n: I18n, flag: string, nameOf: (id: string) => string): string {
  const { t, fmt } = i18n;
  const [kind, value = ''] = flag.split(/:(.*)/s);
  switch (kind) {
    case 'shared-wikidata':
      return t('flag.shared-wikidata', { list: fmt.list(value.split(',').map(nameOf)) });
    case 'wikipedia-title-differs':
      return t('flag.wikipedia-title-differs', { title: value });
    case 'wikidata-link-corrected': {
      const [from, to] = value.split(':');
      return from === 'none' ? t('flag.wikidata-link-corrected-none', { to }) : t('flag.wikidata-link-corrected', { from, to });
    }
    case 'wikidata-link-mismatch':
      return t('flag.wikidata-link-mismatch', { id: value });
    case 'culture':
      return t(value === 'dated-by-list' ? 'flag.culture-list' : value === 'dated-by-wikidata' ? 'flag.culture-wikidata' : 'flag.culture-period');
    case 'placed-by':
      return i18n.tx(`flag.placed-${value}`, t('flag.placed-country'));
    default:
      return i18n.tx(`flag.${kind}`, flag);
  }
}

function SourceNotes({ region, id }: { region: RegionData; id: string }) {
  const i18n = useI18n();
  const openStory = useTimeline((st) => st.openStory);
  const review = region.review[id];
  if (!review) return null;
  const nameOf = (pid: string) => i18n.polity(region.polities[pid] ?? { id: pid, name: pid.replace(/-/g, ' ') });
  return (
    <section className={s.section}>
      <h4 className={s.h3}>
        {i18n.t('record.sourceNotes')}
        {review.severity === 'check' && <span className={s.badge}>{i18n.t('record.needsReview')}</span>}
      </h4>
      <ul className={s.notes}>
        {review.flags.map((f) => {
          const shared = f.startsWith('shared-wikidata:') ? f.split(':')[1].split(',') : null;
          return (
            <li key={f}>
              {shared ? (
                <>
                  {i18n.t('record.sharesWikidata')}{' '}
                  {shared.map((pid, i) => (
                    <span key={pid}>
                      {i > 0 && ', '}
                      {region.polities[pid] && region.appearances[pid] ? (
                        <button type="button" className={s.inlineLink} onClick={() => openStory({ kind: 'polity', id: pid })}>
                          {nameOf(pid)}
                        </button>
                      ) : (
                        nameOf(pid)
                      )}
                    </span>
                  ))}
                  .
                </>
              ) : (
                describeFlag(i18n, f, nameOf)
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Where a state held land, by country, and how its record was dated and linked. */
export function PolityRecord({ region, id }: { region: RegionData; id: string }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const openStory = useTimeline((st) => st.openStory);
  const polity = region.polities[id];
  const laneById = useMemo(() => new Map(region.lanes.map((l) => [l.id, l])), [region.lanes]);
  const laneLabel = (lid: string) => {
    const l = laneById.get(lid);
    return l ? i18n.lane(l) : lid;
  };
  const rows = useMemo(
    () =>
      [...(region.appearances[id] ?? [])].sort(
        (a, b) => (laneById.get(a.laneId)?.order ?? 0) - (laneById.get(b.laneId)?.order ?? 0) || a.span.from - b.span.from,
      ),
    [region, id, laneById],
  );
  if (!polity) return <p className={s.muted}>{t('record.notInRegion')}</p>;

  return (
    <>
      <section className={s.section}>
        <h4 className={s.h3}>{t('record.where')}</h4>
        {polity.realmOnly && <p className={s.note}>{t('record.realmOnly')}</p>}
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">{t('record.countryToday')}</th>
              <th scope="col">{t('record.years')}</th>
              <th scope="col" className={s.num}>
                {t('record.upTo')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ laneId, span }) => (
              <tr key={`${laneId}-${span.from}`}>
                <td>
                  <button type="button" className={s.rowLink} onClick={() => openStory({ kind: 'polity', id, lane: laneId })}>
                    {laneLabel(laneId)}
                  </button>
                </td>
                <td className={s.years}>{fmt.spanRange(span)}</td>
                <td className={s.num}>
                  {fmt.spanShare(span)}
                  {span.inside && (
                    <span className={s.realmMark} title={t('record.insideMark')} aria-label={t('record.insideMark')}>
                      †
                    </span>
                  )}
                  {span.realm && (
                    <span className={s.realmMark} title={t('record.realmMark')} aria-label={t('record.realmMark')}>
                      *
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={s.footnote}>
          {t('record.upToNote')}
          {rows.some((r) => r.span.realm) && ` ${t('record.realmNote')}`}
          {rows.some((r) => r.span.inside) && ` ${t('record.insideNote')}`}
          {rows.some((r) => r.span.extent === 'unknown') && ` ${t('record.unmappedNote')}`}
        </p>
      </section>

      {polity.culture && <CultureSection info={polity.culture} laneLabel={laneLabel} />}

      {polity.supplement && (
        <section className={s.section}>
          <h4 className={s.h3}>{t('record.datesPlace')}</h4>
          <p className={s.note}>{t('record.supplementIntro')}</p>
          <ul className={s.notes}>
            <CitedYear edge="start" d={polity.supplement.start} />
            <CitedYear edge="end" d={polity.supplement.end} />
            <li>
              {t('record.shownIn', { lane: laneLabel(polity.supplement.place.lane) })}{' '}
              {polity.supplement.place.by === 'cited' ? (
                <>
                  <a href={polity.supplement.place.url} target="_blank" rel="noreferrer">
                    {t('record.theArticle')}
                  </a>
                  {polity.supplement.place.quote && <>: {i18n.quote(polity.supplement.place.quote)}</>}
                </>
              ) : (
                placedBy(i18n, polity.supplement.place.by)
              )}
              .
            </li>
            {polity.supplement.dateNote && <li lang={i18n.locale === 'en' ? undefined : 'en'}>{polity.supplement.dateNote}</li>}
          </ul>
        </section>
      )}

      <section className={s.section}>
        <h4 className={s.h3}>{t('record.readMore')}</h4>
        <ul className={s.links}>
          {polity.wikipedia && (
            <li>
              <a href={wikipediaUrl(polity.wikipedia)} target="_blank" rel="noreferrer">
                {t('record.wikipediaLink', { title: polity.wikipedia })}
                <Icon name="external" size={14} />
              </a>
            </li>
          )}
          <WikidataLine polity={polity} />
        </ul>
      </section>

      <SourceNotes region={region} id={id} />
    </>
  );
}

/** How a key event was dated and placed. */
export function EventRecord({ region, id }: { region: RegionData; id: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const openStory = useTimeline((st) => st.openStory);
  const entry = region.events[id];
  if (!entry) return <p className={s.muted}>{t('record.notInRegion')}</p>;
  const { event, laneIds } = entry;
  const minLinks = region.cited?.events?.minSitelinks;
  const unit = event.prec === 8 ? 'decade' : event.prec === 7 ? 'century' : event.prec === 6 ? 'millennium' : null;
  return (
    <>
      <section className={s.section}>
        <dl className={s.eventFacts}>
          <dt>{t('record.eventShownIn')}</dt>
          <dd>
            {laneIds.map((lid, i) => {
              const lane = region.lanes.find((l) => l.id === lid);
              return (
                <span key={lid}>
                  {i > 0 && ', '}
                  <button type="button" className={s.inlineLink} onClick={() => openStory({ kind: 'event', id, lane: lid })}>
                    {lane ? i18n.lane(lane) : lid}
                  </button>
                </span>
              );
            })}
            <span className={s.linkMeta}>{t('record.eventPlacedBy', { by: placedBy(i18n, event.by) })}</span>
            {unit && <span className={s.linkMeta}>{t('record.eventPrecision', { unit })}</span>}
          </dd>
        </dl>
      </section>
      <section className={s.section}>
        <ul className={s.links}>
          {event.wiki && (
            <li>
              <a href={wikipediaUrl(event.wiki)} target="_blank" rel="noreferrer">
                {t('record.wikipediaLink', { title: event.wiki })}
                <Icon name="external" size={14} />
              </a>
            </li>
          )}
          <li>
            <a href={wikidataUrl(event.id)} target="_blank" rel="noreferrer">
              {t('record.wikidataLink', { label: event.id })}
              <Icon name="external" size={14} />
            </a>
          </li>
        </ul>
        <p className={s.footnote}>{t('record.eventFootnote', { minLinks: minLinks ? String(minLinks) : 'none' })}</p>
      </section>
    </>
  );
}

/** The cited row behind an era, its culture area and other scholarly datings. */
export function EraRecord({ region, era }: { region: RegionData; era: Era }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const area = region.eraAreas[era.area];
  const en = i18n.locale === 'en' ? undefined : 'en';
  const block = (key: MessageKey, body: ReactNode) => (
    <section className={s.section}>
      <h4 className={s.h3}>{t(key)}</h4>
      {body}
    </section>
  );
  return (
    <>
      {era.cite
        ? block(
            'record.eraQuote',
            <p className={s.note}>
              <Quote c={era.cite} />
              {era.cite.text && (
                <span className={s.linkMeta} lang={en}>
                  {era.cite.text}
                </span>
              )}
            </p>,
          )
        : block('record.eraArea', <p className={s.note}>{t('record.eraBins')}</p>)}
      {area?.note &&
        block(
          'record.eraArea',
          <p className={s.note} lang={en}>
            {area.note}
          </p>,
        )}
      {era.periodo?.length
        ? block(
            'record.eraPeriodo',
            <ul className={s.notes}>
              {era.periodo.map((o) => (
                <li key={o.url}>
                  <a href={o.url} target="_blank" rel="noreferrer">
                    {o.label}
                  </a>{' '}
                  {o.from !== null && o.to !== null ? fmt.range(o.from, o.to) : ''} ({o.source})
                </li>
              ))}
            </ul>,
          )
        : null}
    </>
  );
}
