import { useState, useEffect } from 'react';
import type { Locale } from '@/i18n/locales';
import { createFmt } from '@/i18n/format';
import { formatDate, strings } from './text';
import type { ReplayEvent, ReplayWar } from './types';

interface Props {
  lang: Locale;
  item: { kind: 'event'; e: ReplayEvent } | { kind: 'war'; w: ReplayWar };
  war: ReplayWar | null;
  pinned: boolean;
  /** 0–1 of the stop elapsed, while the replay is running on its own. */
  progress: number | null;
  onClose: () => void;
  onKeep: () => void;
  onResume: () => void;
}

/**
 * The replay's notification, printed like the story drawer: kicker, slab headline, dateline, the stored Wikipedia
 * introduction (or its Slovenian translation, tagged when machine-made) and the source with its revision.
 */
export function EventCard({ lang, item, war, pinned, progress, onClose, onKeep, onResume }: Props) {
  const t = strings(lang);
  const fmt = createFmt(lang);
  const [more, setMore] = useState(false);
  const rec = item.kind === 'event' ? item.e : item.w;
  useEffect(() => setMore(false), [rec.id]);

  const headline = (lang === 'sl' && rec.sl) || rec.label;
  const kicker =
    item.kind === 'event'
      ? [t.classes[item.e.class] ?? t.classes.event, war && ((lang === 'sl' && war.sl) || war.label)].filter(Boolean).join(' · ')
      : t.classes[item.w.class] ?? t.classes.war;

  let dateline: string;
  let note: string | null = null;
  if (item.kind === 'event') {
    const d = formatDate(item.e.date, lang);
    note = d.note;
    const c = item.e.countries[0];
    const place = !item.e.coord ? t.noPlace : c ? (lang === 'sl' && c.sl) || c.label : t.atSea;
    dateline = `${d.text} — ${place}`;
  } else {
    dateline = fmt.range(item.w.start[0], item.w.end[0]);
  }

  const sl = lang === 'sl' && rec.storySl;
  const paragraphs = sl ? rec.storySl!.paragraphs : rec.story?.paragraphs ?? [];
  const machine = sl && rec.storySl!.method && !rec.storySl!.reviewed;
  const shown = more ? paragraphs : paragraphs.slice(0, 1);
  const sides = rec.participants.filter((p) => p.label).slice(0, 6);

  return (
    <article className={`rp-card${pinned ? ' is-pinned' : ''}`} aria-live="polite">
      {progress !== null && !pinned && <div className="rp-card__progress" style={{ transform: `scaleX(${1 - progress})` }} />}
      <header className="rp-card__head">
        <p className="rp-card__kicker">{kicker}</p>
        <button className="rp-card__x" onClick={onClose} aria-label={t.close}>
          ×
        </button>
      </header>
      <h2 className="rp-card__headline">{headline}</h2>
      <p className="rp-card__dateline">
        {dateline}
        {note && <span className="rp-card__note"> ({note})</span>}
      </p>
      {item.kind === 'event' && item.e.textDate && (
        <p className="rp-card__conflict">{t.dateConflict(formatDate(item.e.textDate, lang).text)}</p>
      )}
      <div className="rp-card__body">
        {shown.length ? (
          shown.map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <>
            {rec.description && <p className="rp-card__desc">{rec.description}</p>}
            <p className="rp-card__muted">{t.noText}</p>
          </>
        )}
        {paragraphs.length > 1 && (
          <button className="rp-link" onClick={() => setMore(!more)}>
            {more ? t.less : t.more}
          </button>
        )}
      </div>
      {sides.length > 0 && (
        <p className="rp-card__sides">
          <span>{t.sides}:</span> {sides.map((p) => p.label).join(' · ')}
        </p>
      )}
      {item.kind === 'event' && item.e.editorial && (
        <p className="rp-card__muted">
          {t.added}: {item.e.editorial.why}
        </p>
      )}
      <footer className="rp-card__foot">
        <p className="rp-card__source">
          {machine && <span className="rp-card__ai">{t.machine}</span>}
          {rec.story ? (
            <>
              <a href={rec.story.url} target="_blank" rel="noreferrer">
                Wikipedia: {rec.story.title}
              </a>{' '}
              · rev. {rec.story.rev} · {rec.story.retrieved} · CC BY-SA 4.0
            </>
          ) : (
            <a href={`https://www.wikidata.org/wiki/${rec.id}`} target="_blank" rel="noreferrer">
              Wikidata {rec.id}
            </a>
          )}
        </p>
        <div className="rp-card__actions">
          {pinned ? (
            <button className="rp-btn rp-btn--primary" onClick={onResume}>
              {t.resume}
            </button>
          ) : (
            <button className="rp-btn" onClick={onKeep}>
              {t.keep}
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
