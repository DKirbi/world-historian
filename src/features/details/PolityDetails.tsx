import { useMemo, type CSSProperties } from 'react';
import type { Cite, CitedDate, CultureInfo, Polity, RegionData } from '@/data/types';
import { formatSpanRange, formatSpanShare, formatWdTime, formatYear } from '@/lib/format';
import { describeFlag } from '@/lib/spans';
import { useTimeline } from '@/state/store';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SLOT_NAMES, slotColor } from '@/features/timeline/colors';
import { regionYears } from '@/features/filters/PolitySearch';
import s from './details.module.scss';

const wikipediaUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const wikidataUrl = (id: string) => `https://www.wikidata.org/wiki/${id}`;

const PLACED_BY: Record<string, string> = {
  'present-day': 'its present-day location on Wikidata',
  coordinates: 'its coordinates on Wikidata',
  capital: 'the coordinates of its capital on Wikidata',
  country: 'its country on Wikidata',
  'capital-country': 'the country of its capital on Wikidata',
};

/** "1873" with where it comes from: Wikidata, or a linked quotation. */
const CULTURE_PLACED_BY: Record<string, string> = {
  list: 'the place named in the list',
  'list-country': 'the country the list gives',
  coordinates: 'its coordinates on Wikidata',
  country: 'its country on Wikidata',
  article: 'the places named in its Wikipedia article',
  'source-page': 'the list it comes from',
};

/** A quotation with a link to the exact revision it was read from. */
function Quote({ c }: { c: Cite }) {
  return (
    <>
      “{c.quote}” —{' '}
      <a href={c.permalink} target="_blank" rel="noreferrer">
        {c.page}
      </a>
    </>
  );
}

/** How a culture from the Wikipedia lists was dated and placed, with every row that lists it. */
function CultureSection({ info, laneLabel }: { info: CultureInfo; laneLabel: (id: string) => string }) {
  const { dates, place } = info;
  const pages = [...new Map(info.listed.map((c) => [c.page, c])).values()];
  return (
    <section className={s.section} aria-labelledby="culture-heading">
      <h3 id="culture-heading" className={s.h3}>
        Dates and place
      </h3>
      <p className={s.note}>
        An archaeological culture or people from Wikipedia’s lists of pre-Columbian cultures, not a mapped state. Its
        territory is not drawn.
      </p>
      <ul className={s.notes}>
        <li>
          {dates.by === 'list' && dates.cite?.length ? (
            <>
              Dates from the list{dates.approx ? ' (approximate)' : ''}:{' '}
              {dates.cite.map((c, i) => (
                <span key={i}>
                  {i > 0 && '; '}
                  <Quote c={c} />
                </span>
              ))}
            </>
          ) : dates.by === 'wikidata' && dates.wd ? (
            <>
              Dates from Wikidata: {formatWdTime(dates.wd[0])} – {formatWdTime(dates.wd[1])}. The list gives none.
            </>
          ) : (
            <>
              Dated by the period{(dates.cite?.length ?? 0) > 1 ? 's' : ''} the source lists it under (approximate):{' '}
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
          Shown in {place.lanes.map(laneLabel).join(', ')}, by {CULTURE_PLACED_BY[place.by] ?? place.by}
          {place.by === 'list' && place.text ? <>: “{place.text}”</> : null}
          {place.by === 'list-country' && place.text ? <>: {place.text}</> : null}
          {place.by === 'article' && place.quote ? (
            <>
              : “{place.quote}” —{' '}
              <a href={place.permalink ?? undefined} target="_blank" rel="noreferrer">
                {place.article}
              </a>
            </>
          ) : null}
          .
        </li>
        <li>
          Listed in{' '}
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

function CitedYear({ label, d }: { label: string; d: CitedDate }) {
  if (d.ongoing) return <li>{label}: still exists (no end date on Wikidata).</li>;
  const year = d.wd ? formatWdTime(d.wd) : d.year === undefined ? '?' : `${d.approx ? 'c. ' : ''}${formatYear(d.year)}`;
  return (
    <li>
      {label}: <strong>{year}</strong>
      {d.source === 'wikidata' ? (
        <>
          {' (Wikidata)'}
          {d.wd &&
            d.year !== undefined &&
            `; the chart uses ${formatYear(d.year)}, the ${label === 'Start' ? 'first' : 'last'} year of that ${
              d.wd[1] === 8 ? 'decade' : d.wd[1] === 7 ? 'century' : 'millennium'
            }`}
        </>
      ) : d.source ? (
        <>
          {' '}
          from{' '}
          <a href={d.source} target="_blank" rel="noreferrer">
            Wikipedia
          </a>
          {d.quote && <>: “{d.quote}”</>}
        </>
      ) : null}
    </li>
  );
}

/** The chart's Wikidata link after the build's check, with Wikidata's own dates for comparison. */
function WikidataLine({ polity }: { polity: Polity }) {
  const wd = polity.wd;
  if (!wd) {
    return polity.wikidata ? (
      <li>
        <a href={wikidataUrl(polity.wikidata)} target="_blank" rel="noreferrer">
          Wikidata: {polity.wikidata}
          <Icon name="external" size={14} />
        </a>
      </li>
    ) : null;
  }
  const dates = wd.start || wd.end ? `${formatWdTime(wd.start)} – ${wd.end ? formatWdTime(wd.end) : 'today'}` : null;
  if (!wd.id) {
    return (
      <li className={s.muted}>
        No Wikidata link: the source’s link ({wd.sourceId}
        {wd.sourceLabel ? `, “${wd.sourceLabel}”` : ''}
        {dates ? `, ${dates}` : ''}) has dates that do not match this state.
      </li>
    );
  }
  return (
    <li>
      <a href={wikidataUrl(wd.id)} target="_blank" rel="noreferrer">
        Wikidata: {wd.label ?? wd.id}
        <Icon name="external" size={14} />
      </a>
      {dates && <span className={s.linkMeta}> Wikidata dates: {dates}</span>}
      {wd.status === 'corrected' && (
        <span className={s.linkMeta}>
          {' '}
          Found through the Wikipedia article; the source linked {wd.sourceId}
          {wd.sourceLabel ? ` (“${wd.sourceLabel}”)` : ''}.
        </span>
      )}
    </li>
  );
}

/** Everything known about one polity: where it held land, when, and where the record comes from. */
export function PolityDetails({ region, id }: { region: RegionData; id: string }) {
  const polity = region.polities[id];
  const highlights = useTimeline((st) => st.highlights);
  const toggleHighlight = useTimeline((st) => st.toggleHighlight);
  const zoomTo = useTimeline((st) => st.zoomTo);
  const selectPolity = useTimeline((st) => st.selectPolity);
  const slot = highlights.find((h) => h.id === id)?.slot;
  const laneById = useMemo(() => new Map(region.lanes.map((l) => [l.id, l])), [region.lanes]);
  const rows = useMemo(
    () =>
      [...(region.appearances[id] ?? [])].sort(
        (a, b) => laneById.get(a.laneId)!.order - laneById.get(b.laneId)!.order || a.span.from - b.span.from,
      ),
    [region, id, laneById],
  );
  const review = region.review[id];
  const years = regionYears(region, id);
  const nameOf = (pid: string) => region.polities[pid]?.name ?? pid.replace(/-/g, ' ');

  if (!polity) return <p className={s.muted}>This state is not in the Europe data.</p>;

  return (
    <>
      <section className={s.section}>
        <div className={s.actions}>
          {years && (
            <Button icon="fit" onClick={() => zoomTo({ type: 'years', years })}>
              Zoom to its years
            </Button>
          )}
          <Button onClick={() => toggleHighlight(id)} aria-pressed={Boolean(slot)}>
            {slot ? (
              <>
                <span
                  className={s.swatch}
                  style={{ '--swatch': slotColor(slot) } as CSSProperties}
                  aria-hidden="true"
                />
                Remove {SLOT_NAMES[slot]} highlight
              </>
            ) : (
              'Highlight on the chart'
            )}
          </Button>
        </div>
        {polity.realmOnly && <p className={s.note}>Recorded only together with its vassal states.</p>}
      </section>

      <section className={s.section} aria-labelledby="where-heading">
        <h3 id="where-heading" className={s.h3}>
          Where it held land
        </h3>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Country today</th>
              <th scope="col">Years</th>
              <th scope="col" className={s.num}>
                Up to
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ laneId, span }) => (
              <tr key={`${laneId}-${span.from}`}>
                <td>
                  <button
                    type="button"
                    className={s.rowLink}
                    onClick={() =>
                      zoomTo({
                        type: 'years',
                        years: [span.from, span.to],
                        laneId,
                      })
                    }
                  >
                    {laneById.get(laneId)?.label}
                  </button>
                </td>
                <td className={s.years}>{formatSpanRange(span)}</td>
                <td className={s.num}>
                  {formatSpanShare(span)}
                  {span.inside && (
                    <span
                      className={s.realmMark}
                      title="Lay mostly within this country"
                      aria-label="lay mostly within this country"
                    >
                      †
                    </span>
                  )}
                  {span.realm && (
                    <span
                      className={s.realmMark}
                      title="Counting its vassal states"
                      aria-label="counting vassal states"
                    >
                      *
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={s.footnote}>
          “Up to” is the largest share of the modern country’s area it held during those years.
          {rows.some((r) => r.span.realm) && ' * counts its vassal states.'}
          {rows.some((r) => r.span.inside) && ' † a small share of the country, but most of the state lay inside it.'}
          {rows.some((r) => r.span.extent === 'unknown') && ' “Not mapped”: the map source does not cover this state.'}
        </p>
      </section>

      {polity.culture && <CultureSection info={polity.culture} laneLabel={(id) => laneById.get(id)?.label ?? id} />}

      {polity.supplement && (
        <section className={s.section} aria-labelledby="cited-heading">
          <h3 id="cited-heading" className={s.h3}>
            Dates and place
          </h3>
          <p className={s.note}>
            The map source (Cliopatria) does not include this state, so its territory is not drawn. It is shown in one
            country of today, with dates from Wikidata or from a quoted Wikipedia article.
          </p>
          <ul className={s.notes}>
            <CitedYear label="Start" d={polity.supplement.start} />
            <CitedYear label="End" d={polity.supplement.end} />
            <li>
              Shown in {laneById.get(polity.supplement.place.lane)?.label ?? polity.supplement.place.lane}, by{' '}
              {polity.supplement.place.by === 'cited' ? (
                <>
                  <a href={polity.supplement.place.url} target="_blank" rel="noreferrer">
                    the article
                  </a>
                  {polity.supplement.place.quote && <>: “{polity.supplement.place.quote}”</>}
                </>
              ) : (
                PLACED_BY[polity.supplement.place.by]
              )}
              .
            </li>
            {polity.supplement.dateNote && <li>{polity.supplement.dateNote}</li>}
          </ul>
        </section>
      )}

      <section className={s.section} aria-labelledby="refs-heading">
        <h3 id="refs-heading" className={s.h3}>
          Read more
        </h3>
        <ul className={s.links}>
          {polity.wikipedia && (
            <li>
              <a href={wikipediaUrl(polity.wikipedia)} target="_blank" rel="noreferrer">
                Wikipedia: {polity.wikipedia}
                <Icon name="external" size={14} />
              </a>
            </li>
          )}
          <WikidataLine polity={polity} />
        </ul>
      </section>

      {review && (
        <section className={s.section} aria-labelledby="notes-heading">
          <h3 id="notes-heading" className={s.h3}>
            Source notes
            {review.severity === 'check' && <span className={s.badge}>Needs review</span>}
          </h3>
          <ul className={s.notes}>
            {review.flags.map((f) => {
              const shared = f.startsWith('shared-wikidata:') ? f.split(':')[1].split(',') : null;
              return (
                <li key={f}>
                  {shared ? (
                    <>
                      Shares its Wikidata entry with{' '}
                      {shared.map((pid, i) => (
                        <span key={pid}>
                          {i > 0 && ', '}
                          {region.polities[pid] && region.appearances[pid] ? (
                            <button type="button" className={s.inlineLink} onClick={() => selectPolity(pid)}>
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
                    describeFlag(f, nameOf)
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
