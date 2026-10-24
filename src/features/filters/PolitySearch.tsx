import { useId, useMemo, useRef, useState } from 'react';
import type { HistEvent, Polity, RegionData } from '@/data/types';
import { useTimeline } from '@/state/store';
import { useI18n } from '@/i18n/useI18n';
import { regionText } from '@/i18n/regionText';
import { Icon } from '@/components/ui/Icon';
import s from './FilterBar.module.scss';

/** Years a polity appears anywhere in this region's lanes. */
export function regionYears(region: RegionData, id: string): [number, number] | null {
  const apps = region.appearances[id];
  if (!apps?.length) return null;
  return [Math.min(...apps.map((a) => a.span.from)), Math.max(...apps.map((a) => a.span.to))];
}

type Result = { kind: 'polity'; p: Polity } | { kind: 'event'; e: HistEvent };

/** Where `needle` sits in `name`: 0 at the start, 1 at a word start, 2 inside a word, -1 absent. */
function matchRank(name: string, needle: string): number {
  const i = name.indexOf(needle);
  if (i < 0) return -1;
  return i === 0 ? 0 : name[i - 1] === ' ' ? 1 : 2;
}

/** Best match of `needle` in a record's names: the reader's language first, then the data's English. */
const bestRank = (names: string[], needle: string) =>
  names.reduce((best, n) => {
    const m = matchRank(n.toLowerCase(), needle);
    return m >= 0 && (best < 0 || m < best) ? m : best;
  }, -1);

/** Find a state or key event by name and open its story, zoomed to its years. */
export function PolitySearch({ region }: { region: RegionData }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const openStory = useTimeline((st) => st.openStory);
  const zoomTo = useTimeline((st) => st.zoomTo);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const hasEvents = Object.keys(region.events).length > 0;
  const results = useMemo((): Result[] => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const scored: Array<{ r: Result; rank: number }> = [];
    for (const p of Object.values(region.polities)) {
      if (!region.appearances[p.id]) continue;
      const m = bestRank([i18n.polity(p), p.name], needle);
      if (m >= 0)
        scored.push({
          r: { kind: 'polity', p },
          rank: m * 2 * 100_000 + p.years[0],
        });
    }
    // Events rank after states with an equally good match, so state names stay easy to reach.
    for (const { event: e } of Object.values(region.events)) {
      const name = i18n.event(e).toLowerCase();
      let m = bestRank([i18n.event(e), e.name], needle);
      // "hastings" should find "Battle of Hastings" as readily as a name that starts with it
      if (
        m === 1 &&
        /^(battle|siege|treaty|war|peace) of /.test(name) &&
        name.indexOf(needle) === name.indexOf(' of ') + 4
      )
        m = 0;
      if (m >= 0)
        scored.push({
          r: { kind: 'event', e },
          rank: (m * 2 + 1) * 100_000 + e.year,
        });
    }
    return scored
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 10)
      .map((x) => x.r);
  }, [q, region, i18n]);

  const choose = (r: Result) => {
    if (r.kind === 'polity') {
      openStory({ kind: 'polity', id: r.p.id });
      const years = regionYears(region, r.p.id);
      if (years) zoomTo({ type: 'years', years });
    } else {
      const { e } = r;
      const end = e.to ?? e.year;
      const pad = Math.max(10, Math.round((end - e.year) * 0.3));
      const laneId = region.events[e.id]?.laneIds[0];
      openStory({ kind: 'event', id: e.id, lane: laneId });
      zoomTo({ type: 'years', years: [e.year - pad, end + pad], laneId });
    }
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const showList = open && q.trim().length > 0;

  return (
    <div className={s.search}>
      <Icon name="search" size={16} />
      <input
        ref={inputRef}
        id="polity-search"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        aria-label={t(hasEvents ? 'search.label' : 'search.labelNoEvents')}
        placeholder={t(hasEvents ? 'search.placeholder' : 'search.placeholderNoEvents')}
        value={q}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === 'Escape') {
            setQ('');
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className={s.results} aria-label={t('search.matches')}>
          {results.length === 0 && (
            <li className={s.noResult}>{t('search.none', { in: regionText(i18n, region.id).in, q: q.trim() })}</li>
          )}
          {results.map((r, i) => {
            const key = r.kind === 'polity' ? r.p.id : r.e.id;
            const name = r.kind === 'polity' ? i18n.polity(r.p) : i18n.event(r.e);
            let meta: string;
            if (r.kind === 'polity') {
              const years = regionYears(region, r.p.id)!;
              meta = fmt.range(years[0], years[1]);
            } else meta = `${t(`event.${r.e.type}`)}, ${fmt.eventDate(r.e)}`;
            return (
              <li
                key={key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={s.result}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
              >
                <span className={s.resultName}>{name}</span>
                <span className={s.resultYears}>{meta}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
