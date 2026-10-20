import { useMemo } from 'react';
import type { OmittedLane, RegionData } from '@/data/types';
import { useTimeline } from '@/state/store';
import { useI18n } from '@/i18n/useI18n';
import { regionText } from '@/i18n/regionText';
import { Icon } from '@/components/ui/Icon';
import s from './details.module.scss';

/** Name a missing column; list its Natural Earth units only when it would have combined several. */
const laneName = (l: OmittedLane) => (l.naturalEarth.length > 1 ? `${l.label} (${l.naturalEarth.join(', ')})` : l.label);

/**
 * Attribution required by the data licences, plus how to read the chart. Notes written by the data
 * build (period notes, culture-area notes, reasons for missing columns) are in English and marked so.
 */
export function SourcesPanel({ region }: { region: RegionData }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const en = i18n.locale === 'en' ? undefined : 'en';
  const text = regionText(i18n, region.id);
  const openStory = useTimeline((st) => st.openStory);
  const added = useMemo(
    () =>
      Object.values(region.polities)
        .filter((p) => p.supplement && region.appearances[p.id])
        .map((p) => ({ p, laneId: region.appearances[p.id][0].laneId, span: region.appearances[p.id][0].span }))
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
      {Boolean(text.notes.length || region.periodNote || region.omittedLanes.length) && (
        <section className={s.section}>
          <h3 className={s.h3}>{t('sources.about', { region: text.label })}</h3>
          <ul className={s.notes}>
            {text.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {region.periodNote && (
              <li>
                {t('sources.periodNote')} <span lang={en}>{region.periodNote}</span>
                {region.periodSources.map((url, i) => (
                  <span key={url}>
                    {' '}
                    <a href={url} target="_blank" rel="noreferrer">
                      {region.periodSources.length > 1 ? t('sources.sourceN', { n: i + 1 }) : t('sources.source')}
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
          <h3 className={s.h3}>{t('sources.noColumn')}</h3>
          <ul className={s.notes}>
            {region.omittedLanes.map((l) => (
              <li key={l.id}>
                <strong>{laneName(l)}</strong>:{' '}
                {l.reason === 'no Cliopatria polity covers this area in any year' ? (
                  t('sources.noState')
                ) : (
                  <span lang={en}>{l.reason}</span>
                )}
                {l.source && (
                  <>
                    {' '}
                    <a href={l.source} target="_blank" rel="noreferrer">
                      {t('sources.source')}
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
          <h3 className={s.h3}>{t('sources.eras')}</h3>
          <p className={s.note}>{t('sources.erasIntro')}</p>
          {sourcedAreas.map((a) => (
            <div key={a.id} className={s.source}>
              <p className={s.sourceTitle}>{i18n.tx(`area.${a.id}`, a.label ?? a.id)}</p>
              {a.note && <p lang={en}>{a.note}</p>}
              <p>
                {t('sources.eraSources', { n: a.sources?.length ?? 1 })}{' '}
                {a.sources?.map((src, i) => (
                  <span key={src.page}>
                    {i > 0 && ', '}
                    <a href={src.permalink} target="_blank" rel="noreferrer">
                      {src.page}
                    </a>
                  </span>
                ))}{' '}
                {t('sources.eraRevision')}
              </p>
              <ul className={s.notes}>
                {erasOf(a.id).map((e) => (
                  <li key={e.id}>
                    <button type="button" className={s.inlineLink} onClick={() => openStory({ kind: 'era', id: e.id })}>
                      <strong lang={en}>{e.name}</strong>
                    </button>{' '}
                    {fmt.spanRange(e)}
                    {e.clippedFrom !== undefined && ` ${t('sources.clipped', { year: fmt.year(e.clippedFrom) })}`}
                    {e.periodo?.map((o) => (
                      <span key={o.url}>
                        {'. '}PeriodO:{' '}
                        <a href={o.url} target="_blank" rel="noreferrer">
                          {o.label}
                        </a>{' '}
                        {o.from !== null && o.to !== null ? fmt.range(o.from, o.to) : ''} ({o.source})
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
          <h3 className={s.h3}>{t('sources.cultures')}</h3>
          <p className={s.note}>{t('sources.culturesIntro', { n: nCultures })}</p>
          {culturesNote && (
            <ul className={s.notes}>
              {culturesNote.undated?.length > 0 && <li>{t('sources.undated', { list: culturesNote.undated.join(', ') })}</li>}
              {culturesNote.unplaced?.length > 0 && <li>{t('sources.unplaced', { list: culturesNote.unplaced.join(', ') })}</li>}
              {culturesNote.living?.length > 0 && <li>{t('sources.living', { list: culturesNote.living.join(', ') })}</li>}
              {culturesNote.onChart?.length > 0 && <li>{t('sources.onChart', { list: culturesNote.onChart.join(', ') })}</li>}
              {culturesNote.excluded?.map((x) => (
                <li key={x} lang={en}>
                  {x}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {added.length > 0 && (
        <section className={s.section}>
          <h3 className={s.h3}>{t('sources.added')}</h3>
          <p className={s.note}>{t('sources.addedIntro')}</p>
          <ul className={s.notes}>
            {added.map(({ p, laneId, span }) => (
              <li key={p.id}>
                <button type="button" className={s.inlineLink} onClick={() => openStory({ kind: 'polity', id: p.id, lane: laneId })}>
                  {i18n.polity(p)}
                </button>{' '}
                {fmt.spanRange(span)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(nEvents > 0 || link) && (
        <section className={s.section}>
          <h3 className={s.h3}>{t('sources.checks')}</h3>
          <ul className={s.notes}>
            {nEvents > 0 && (
              <li>
                {t('sources.eventsNote', {
                  n: fmt.number(nEvents),
                  minLinks: evNote?.minSitelinks ? String(evNote.minSitelinks) : 'none',
                  maxLanes: evNote?.maxCountryLanes ?? 3,
                })}
              </li>
            )}
            {link && (
              <li>
                {t('sources.linkNote', {
                  ok: link.ok ?? 0,
                  unknown: link.unknown ?? 0,
                  corrected: link.corrected ?? 0,
                  mismatch: link.mismatch ?? 0,
                })}
              </li>
            )}
          </ul>
        </section>
      )}
      <section className={s.section}>
        <h3 className={s.h3}>{t('sources.stories')}</h3>
        <p className={s.note}>{t('sources.storiesNote')}</p>
      </section>
      <section className={s.section}>
        <h3 className={s.h3}>{t('sources.data')}</h3>
        {region.sources.map((src) => (
          <div key={src.id} className={s.source}>
            <a href={src.url} target="_blank" rel="noreferrer" className={s.sourceTitle}>
              {src.title}
              {src.version ? ` (${src.version})` : ''}
              <Icon name="external" size={14} />
            </a>
            {src.authors && <p>{src.authors}</p>}
            <p>
              {t('sources.licence')}{' '}
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
            {src.retrieved && <p>{t('sources.retrieved', { date: src.retrieved })}</p>}
            {src.changes && (
              <p>
                {t('sources.changes', { changes: '' })}
                <span lang={en}>{src.changes}</span>
              </p>
            )}
          </div>
        ))}
      </section>

      <section className={s.section}>
        <h3 className={s.h3}>{t('sources.howToRead')}</h3>
        <ul className={s.notes}>
          {i18n.all('sources.read.').map((line) => (
            <li key={line}>{line}</li>
          ))}
          {added.length > 0 && <li>{t('sources.read.unmapped')}</li>}
          {nEvents > 0 && <li>{t('sources.read.events')}</li>}
        </ul>
      </section>
    </>
  );
}
