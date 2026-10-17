import { useMemo } from 'react';
import type { OmittedLane, RegionData } from '@/data/types';
import { formatRange, formatSpanRange, formatYear } from '@/lib/format';
import { useTimeline } from '@/state/store';
import { Icon } from '@/components/ui/Icon';
import { regionMeta } from '@/data/regions';
import s from './details.module.scss';

/** Name a missing column; list its Natural Earth units only when it would have combined several. */
const laneName = (l: OmittedLane) =>
  l.naturalEarth.length > 1 ? `${l.label} (${l.naturalEarth.join(', ')})` : l.label;

/** The build writes a fixed reason for empty lanes; anything else is already written for readers. */
const omittedReason = (reason: string) =>
  reason === 'no Cliopatria polity covers this area in any year'
    ? 'the source has no state there in any year.'
    : reason;

/** Attribution required by the data licences, plus how to read the chart. */
export function SourcesPanel({ region }: { region: RegionData }) {
  const meta = regionMeta(region.id);
  const selectPolity = useTimeline((st) => st.selectPolity);
  const added = useMemo(
    () =>
      Object.values(region.polities)
        .filter((p) => p.supplement && region.appearances[p.id])
        .map((p) => ({ p, span: region.appearances[p.id][0].span }))
        .sort((a, b) => a.span.from - b.span.from),
    [region],
  );
  const nCultures = useMemo(
    () => Object.values(region.polities).filter((p) => p.culture && region.appearances[p.id]).length,
    [region],
  );
  const culturesNote = region.cited?.cultures;
  const sourcedAreas = Object.values(region.eraAreas).filter((a) => !a.bins);
  const erasOf = (areaId: string) => region.eras.filter((e) => e.area === areaId);
  const nEvents = Object.keys(region.events).length;
  const link = region.cited?.linkCheck;
  const evNote = region.cited?.events;
  return (
    <>
      {Boolean(meta.notes?.length || region.periodNote || region.omittedLanes.length) && (
        <section className={s.section}>
          <h3 className={s.h3}>About the {meta.label} data</h3>
          <ul className={s.notes}>
            {meta.notes?.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {region.periodNote && (
              <li>
                Period names on the time axis: {region.periodNote}
                {region.periodSources.map((url, i) => (
                  <span key={url}>
                    {' '}
                    <a href={url} target="_blank" rel="noreferrer">
                      Source{region.periodSources.length > 1 ? ` ${i + 1}` : ''}
                    </a>
                  </span>
                ))}
              </li>
            )}
          </ul>
        </section>
      )}
      {region.omittedLanes.length > 0 && (
        <section className={s.section}>
          <h3 className={s.h3}>Countries without a column</h3>
          <ul className={s.notes}>
            {region.omittedLanes.map((l) => (
              <li key={l.id}>
                <strong>{laneName(l)}</strong>: {omittedReason(l.reason)}
                {l.source && (
                  <>
                    {' '}
                    <a href={l.source} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {region.eras.length > 0 && (
        <section className={s.section}>
          <h3 className={s.h3}>Eras</h3>
          <p className={s.note}>
            The Eras level shows the periods of each culture area from a cited periodization. Elsewhere, after an
            area’s last period and, where its source starts late, before its first one, it uses the region’s period
            bins per group of countries, only where the data records a state or culture. The names under each era are
            the cultures its source lists, when the chart has them, or else the records most present in the data.
          </p>
          {sourcedAreas.map((a) => (
            <div key={a.id} className={s.source}>
              <p className={s.sourceTitle}>{a.label}</p>
              {a.note && <p>{a.note}</p>}
              <p>
                Source{(a.sources?.length ?? 0) > 1 ? 's' : ''}:{' '}
                {a.sources?.map((src, i) => (
                  <span key={src.page}>
                    {i > 0 && ', '}
                    <a href={src.permalink} target="_blank" rel="noreferrer">
                      {src.page}
                    </a>
                  </span>
                ))}{' '}
                (English Wikipedia, revision read on the snapshot date).
              </p>
              <ul className={s.notes}>
                {erasOf(a.id).map((e) => (
                  <li key={e.id}>
                    <strong>{e.name}</strong> {formatSpanRange(e)}
                    {e.clippedFrom !== undefined &&
                      ` (from ${formatYear(e.clippedFrom)}; the chart starts in 3400 BCE)`}
                    {e.periodo?.map((o) => (
                      <span key={o.url}>
                        {'. '}PeriodO:{' '}
                        <a href={o.url} target="_blank" rel="noreferrer">
                          {o.label}
                        </a>{' '}
                        {o.from !== null && o.to !== null ? formatRange(o.from, o.to) : ''} ({o.source})
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {nCultures > 0 && (
        <section className={s.section}>
          <h3 className={s.h3}>Cultures from Wikipedia’s lists</h3>
          <p className={s.note}>
            {nCultures} archaeological cultures and peoples come from Wikipedia’s lists of pre-Columbian cultures, North
            American archaeological periods and the periodization of pre-Columbian Peru. Each keeps the rows that list
            it, linked to the revision that was read. They are drawn like added states: pale, with a dashed edge.
          </p>
          {culturesNote && (
            <ul className={s.notes}>
              {culturesNote.undated?.length > 0 && (
                <li>Left out, no start or end date: {culturesNote.undated.join(', ')}.</li>
              )}
              {culturesNote.unplaced?.length > 0 && (
                <li>Left out, no place found: {culturesNote.unplaced.join(', ')}.</li>
              )}
              {culturesNote.living?.length > 0 && <li>Left out, living peoples: {culturesNote.living.join(', ')}.</li>}
              {culturesNote.onChart?.length > 0 && <li>Already on the chart: {culturesNote.onChart.join(', ')}.</li>}
              {culturesNote.excluded?.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {added.length > 0 && (
        <section className={s.section}>
          <h3 className={s.h3}>States added from Wikidata</h3>
          <p className={s.note}>
            The map source does not include these states, so they are added with their Wikidata dates (or a quoted
            Wikipedia article where Wikidata has none) and shown in one country without a mapped territory.
          </p>
          <ul className={s.notes}>
            {added.map(({ p, span }) => (
              <li key={p.id}>
                <button type="button" className={s.inlineLink} onClick={() => selectPolity(p.id)}>
                  {p.name}
                </button>{' '}
                {formatSpanRange(span)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(nEvents > 0 || link) && (
        <section className={s.section}>
          <h3 className={s.h3}>Checks against Wikidata</h3>
          <ul className={s.notes}>
            {nEvents > 0 && (
              <li>
                {nEvents.toLocaleString('en-US')} key events: Wikidata items classed as a battle, siege, invasion,
                campaign, war, revolution, rebellion, coup, treaty or pandemic
                {evNote?.minSitelinks ? `, with Wikipedia articles in at least ${evNote.minSitelinks} languages` : ''}.
                Each is placed by its own coordinates, else by its recorded locations, else by its country, and left out
                when those span more than {evNote?.maxCountryLanes ?? 3} countries (the world wars, for example).
                Treaties sit where they were signed.
              </li>
            )}
            {link && (
              <li>
                Wikidata links of the source’s states: {link.ok ?? 0} confirmed by matching dates, {link.unknown ?? 0}{' '}
                without dates to compare, {link.corrected ?? 0} corrected through the Wikipedia article,{' '}
                {link.mismatch ?? 0} hidden because their dates do not match the state. Wikidata’s dates are shown
                beside the chart’s in each state’s panel; the chart keeps the map source’s years.
              </li>
            )}
          </ul>
        </section>
      )}
      <section className={s.section}>
        <h3 className={s.h3}>Data</h3>
        {region.sources.map((src) => (
          <div key={src.id} className={s.source}>
            <a href={src.url} target="_blank" rel="noreferrer" className={s.sourceTitle}>
              {src.title}
              {src.version ? ` (${src.version})` : ''}
              <Icon name="external" size={14} />
            </a>
            {src.authors && <p>{src.authors}</p>}
            <p>
              Licence:{' '}
              {src.licenseUrl ? (
                <a href={src.licenseUrl} target="_blank" rel="noreferrer">
                  {src.license}
                </a>
              ) : (
                src.license
              )}
              {src.doi && (
                <>
                  {'. '}DOI:{' '}
                  <a href={`https://doi.org/${src.doi}`} target="_blank" rel="noreferrer">
                    {src.doi}
                  </a>
                </>
              )}
            </p>
            {src.retrieved && <p>Retrieved {src.retrieved}.</p>}
            {src.changes && <p>Changes made: {src.changes}</p>}
          </div>
        ))}
      </section>

      <section className={s.section}>
        <h3 className={s.h3}>How to read the chart</h3>
        <ul className={s.notes}>
          <li>Each column is a country with today’s borders. Each block is a state that held part of it.</li>
          <li>Darker blocks held more of the country. Hatched blocks count the state together with its vassals.</li>
          <li>
            “Major powers” also shows a smaller state when it is the only one the source records in that country at the
            time.
          </li>
          <li>
            A state that lay mostly inside a large country is shown even when it covered a small part of it, for example
            a city-state. The smaller ones appear under “All states”.
          </li>
          <li>
            The time axis is compressed before 500 CE so recent centuries have more room. Drag, scroll or pinch to move
            and zoom. Zooming in widens the countries too, around your fingers, so the stacked blocks of a country can
            be read and tapped; the other selected countries stay beside it to scroll across.
          </li>
          <li>Start and end years follow the source maps and can be a few years off the usual textbook dates.</li>
          {added.length > 0 && (
            <li>
              Pale blocks with a dashed edge are states the map source does not cover; their territory is not mapped.
            </li>
          )}
          {nEvents > 0 && (
            <li>
              Dots are key events; a rail below a dot runs to the event’s last year. Zoom in to see more of them, and
              select one for its details.
            </li>
          )}
        </ul>
      </section>
    </>
  );
}
