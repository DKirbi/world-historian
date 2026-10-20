import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { RegionData } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { useTimeline, type StoryRef } from '@/state/store';
import { Icon } from '@/components/ui/Icon';
import type { StoryModel } from './templates';
import { useArticle, useImageCredit } from './useArticle';
import { headlineFromTitle, type WikiArticle } from './wiki';
import { EraRecord, EventRecord, PolityRecord } from './Records';
import s from './story.module.scss';

interface Props {
  model: StoryModel;
  region: RegionData;
  /** Reading at full width: the body sets in columns. */
  full: boolean;
}

/** How much of the summary a story prints; the rest is one link away. */
const MAX_PARAGRAPHS = { side: 3, full: 5 };
const MAX_CHARS = { side: 1100, full: 2200 };

function excerpt(paragraphs: string[], full: boolean): string[] {
  const maxP = full ? MAX_PARAGRAPHS.full : MAX_PARAGRAPHS.side;
  const maxC = full ? MAX_CHARS.full : MAX_CHARS.side;
  const shown: string[] = [];
  let chars = 0;
  for (const p of paragraphs) {
    if (shown.length >= maxP || (shown.length > 0 && chars + p.length > maxC)) break;
    shown.push(p);
    chars += p.length;
  }
  return shown;
}

/**
 * One story, set like a newspaper article: kicker, headline, a standfirst that opens with a dateline
 * and is written from the chart's data, then the Wikipedia summary, a box of facts, other points of
 * view to switch the story to, numbered sources, and the record's provenance at the foot.
 */
export function Story({ model, region, full }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const openStory = useTimeline((st) => st.openStory);
  const article = useArticle(model.article, i18n.meta.wiki);
  const ready = article.status === 'ready' ? article.article : null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus the headline when a new story opens, so screen readers announce it and Tab starts here.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [model.key]);

  // A name the data has only in English is replaced by the title of the reader's own article.
  const translatedTitle =
    ready && !ready.fallback && !ready.section && model.kind !== 'stack' && model.headlineLang !== i18n.meta.tag
      ? headlineFromTitle(ready.title)
      : null;
  const headline = translatedTitle ?? model.headline;
  const headlineLang = translatedTitle ? i18n.meta.tag : model.headlineLang;

  const offset = model.article ? 1 : 0; // the Wikipedia article is source [1] when there is one
  const cite = (idx: number[] | undefined) =>
    idx?.length ? (
      <sup className={s.cite}>
        {idx.map((n) => (
          <a key={n} href={`#src-${model.key}-${n + 1 + offset}`}>
            [{n + 1 + offset}]
          </a>
        ))}
      </sup>
    ) : null;

  const shown = useMemo(() => excerpt(ready?.paragraphs ?? [], full), [ready, full]);
  const go = (ref: StoryRef) => openStory(ref);

  return (
    <article className={s.article} data-full={full || undefined} lang={i18n.meta.tag}>
      <header className={s.head}>
        {model.kicker && <p className={s.kicker}>{model.kicker}</p>}
        <h2 ref={headingRef} tabIndex={-1} className={s.headline} lang={headlineLang}>
          {headline}
        </h2>
      </header>

      <div className={s.columns}>
        <div className={s.main}>
          {model.dek.length > 0 && (
            <p className={s.dek}>
              {model.dateline && <span className={s.dateline}>{model.dateline}.</span>}{' '}
              {model.dek.map((sen, i) => (
                <span key={i}>
                  {sen.text}
                  {cite(sen.cite)}{' '}
                </span>
              ))}
            </p>
          )}

          {ready?.image && <Figure article={ready} />}

          <div className={s.body}>
            <Summary state={article} model={model} shown={shown} citeN={1} storyKey={model.key} />
            {ready && (
              <p className={s.readMore}>
                <a href={ready.url} target="_blank" rel="noreferrer">
                  {t('story.readMore')}
                  <Icon name="external" size={14} />
                </a>
              </p>
            )}
          </div>
        </div>
        <div className={s.side}>
          {model.facts.length > 0 && (
            <aside className={s.facts} aria-label={t('story.facts')}>
              <h3 className={s.factsTitle}>{t('story.facts')}</h3>
              <dl>
                {model.facts.map((f) => (
                  <div key={f.label} className={s.fact}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          )}

          {model.related.map((g) => (
            <section key={g.heading} className={s.related}>
              <h3 className={s.relatedTitle}>{g.heading}</h3>
              <ul>
                {g.items.map((it) => (
                  <li key={JSON.stringify(it.ref)}>
                    <button type="button" className={s.pov} onClick={() => go(it.ref)}>
                      <span className={s.povName} lang={it.lang}>
                        {it.name}
                      </span>
                      {it.meta && <span className={s.povMeta}>{it.meta}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <section className={s.sources}>
        <h3 className={s.relatedTitle}>{t('story.sources')}</h3>
        <ol>
          {model.article && (
            <li id={`src-${model.key}-1`}>
              <WikiSource state={article} fallbackTitle={model.article.enTitle ?? model.article.qid ?? ''} />
            </li>
          )}
          {model.sources.map((src, i) => (
            <li key={i} id={`src-${model.key}-${i + 1 + offset}`}>
              {src.href ? (
                <a href={src.href} target="_blank" rel="noreferrer" lang={src.lang}>
                  {src.text}
                </a>
              ) : (
                <span lang={src.lang}>{src.text}</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {model.kind !== 'stack' && (
        <details className={s.record}>
          <summary>
            <span>{t('story.record')}</span>
            <span className={s.recordHint}>{t('story.recordHint')}</span>
          </summary>
          <div className={s.recordBody}>
            {model.ref.kind === 'polity' && <PolityRecord region={region} id={model.ref.id} />}
            {model.ref.kind === 'event' && <EventRecord region={region} id={model.ref.id} />}
            {model.ref.kind === 'era' && <EraOfRef region={region} id={model.ref.id} />}
          </div>
        </details>
      )}
    </article>
  );
}

function EraOfRef({ region, id }: { region: RegionData; id: string }) {
  const era = region.eras.find((e) => e.id === id);
  return era ? <EraRecord region={region} era={era} /> : null;
}

function Summary({
  state,
  model,
  shown,
  citeN,
  storyKey,
}: {
  state: ReturnType<typeof useArticle>;
  model: StoryModel;
  shown: string[];
  citeN: number;
  storyKey: string;
}) {
  const { t } = useI18n();
  if (model.kind === 'stack') return null; // a list of states has no article of its own, by design
  if (!model.article || state.status === 'none') return <p className={s.note}>{t('story.noArticle')}</p>;
  if (state.status === 'loading')
    return (
      <div className={s.pending} aria-busy="true">
        <p className={s.note}>{t('story.loading')}</p>
        <span className={s.line} />
        <span className={s.line} />
        <span className={s.line} data-short />
      </div>
    );
  if (state.status === 'error')
    return (
      <p className={s.note}>
        {t('story.offline')}{' '}
        <button type="button" className={s.retry} onClick={state.retry}>
          {t('story.retry')}
        </button>
      </p>
    );
  const a = state.article;
  return (
    <>
      {a.fallback && <p className={s.note}>{t(a.section ? 'story.sectionFallback' : 'story.fallback')}</p>}
      <div className={s.summary} lang={a.lang}>
        {shown.map((p, i) => (
          <p key={i} className={i === 0 ? s.lead : undefined}>
            {p}
            {i === shown.length - 1 && (
              <sup className={s.cite}>
                <a href={`#src-${storyKey}-${citeN}`}>[{citeN}]</a>
              </sup>
            )}
          </p>
        ))}
      </div>
    </>
  );
}

function WikiSource({ state, fallbackTitle }: { state: ReturnType<typeof useArticle>; fallbackTitle: string }) {
  const { t, fmt } = useI18n();
  if (state.status === 'ready') {
    const a = state.article;
    const title = a.section ? `${a.title}, ${a.section}` : a.title;
    const permalink = a.revision ? `https://${a.lang}.wikipedia.org/w/index.php?oldid=${a.revision}` : a.url;
    return (
      <a href={permalink} target="_blank" rel="noreferrer">
        {t('story.cite.wikipedia', {
          title,
          edition: t(a.lang === 'sl' ? 'wiki.edition.sl' : 'wiki.edition.en'),
          rev: a.revision ? fmt.number(a.revision).replace(/[\s., ]/g, '') : '–',
        })}
      </a>
    );
  }
  return <span>{t('story.cite.wikipediaLoading', { title: fallbackTitle })}</span>;
}

function Figure({ article }: { article: WikiArticle }): ReactNode {
  const { t } = useI18n();
  const img = article.image!;
  const credit = useImageCredit(article.lang, img.file);
  const ratio = img.width && img.height ? img.width / img.height : 1.5;
  return (
    <figure className={s.figure} data-tall={ratio < 0.9 || undefined}>
      <div className={s.plate}>
        <img src={img.src} width={img.width} height={img.height} alt="" loading="lazy" decoding="async" />
      </div>
      <figcaption className={s.caption}>
        {credit ? (
          <a href={credit.page} target="_blank" rel="noreferrer">
            {credit.artist
              ? t('story.imageCredit', { artist: credit.artist, licence: credit.licence ?? '' })
              : t('story.imageCreditNoArtist', { licence: credit.licence ?? t('story.imageFile') })}
          </a>
        ) : img.file ? (
          <a
            href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.file)}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('story.imageFile')}
          </a>
        ) : null}
      </figcaption>
    </figure>
  );
}
