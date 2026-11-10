import { useEffect, useMemo, useState } from 'react';
import { createFmt } from '@/i18n/format';
import { detectLocale, type Locale } from '@/i18n/locales';
import { Board, type CameraTarget } from './Board';
import { EventCard } from './EventCard';
import { Minimap } from './Minimap';
import { Transport } from './Transport';
import { advance, duration, dwellAt, seek, start, stopAt } from './clock';
import { frameAt } from './board';
import { activeWars, boundsOf, buildModel, km, type Mode } from './model';
import { useReplay } from './store';
import { strings } from './text';
import type { ReplayPack } from './types';

/** Events closer than this, in years and km, keep the camera where it is instead of pulling back between them. */
const HOLD = { years: 2.5, km: 650 };
const EVENT_ZOOM = 5.3;

export function App({ pack }: { pack: ReplayPack }) {
  const s = useReplay();
  const model = useMemo(() => buildModel(pack, s.mode), [pack, s.mode]);
  const t = strings(s.lang);
  const fmt = createFmt(s.lang);
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const [about, setAbout] = useState(false);
  const [chart, setChart] = useState(false);

  // Start at the beginning, in the reader's language.
  useEffect(() => {
    s.set({ lang: detectLocale(), clock: start(model.clock) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = s.lang;
    document.title = `${pack.title[s.lang]} · ${fmt.range(pack.range[0], pack.range[1])}`;
  }, [s.lang, pack, fmt]);

  // The playback loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = useReplay.getState();
      if (st.playing && !st.card?.pinned) {
        const step = advance(st.clock, dt, st.speed, model.clock);
        const patch: Parameters<typeof st.set>[0] = { clock: step.state };
        if (step.fired !== null) patch.card = { kind: 'event', index: model.visible[step.fired], pinned: false };
        else if (st.clock.dwell > 0 && step.state.dwell === 0 && st.card?.kind === 'event') patch.card = null;
        if (step.ended) patch.playing = false;
        st.set(patch);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [model]);

  const { clock, card } = s;
  const year = clock.year;
  const frame = frameAt(pack.board.frames, year);
  const wars = activeWars(model, year);
  const cardEvent = card?.kind === 'event' ? pack.events[card.index] : null;
  const cardWar = card?.kind === 'war' ? model.wars.get(card.id) ?? null : null;
  const lastIx = clock.current >= 0 ? model.visible[clock.current] : -1;
  const last = lastIx >= 0 ? pack.events[lastIx] : null;
  const next = clock.cursor < model.visible.length ? pack.events[model.visible[clock.cursor]] : null;

  // The director: the event on the card; else hold on the last event when the next is near in time and place;
  // else the theatre of the wars under way; else the whole stage.
  const target: (CameraTarget & { bounds?: [number, number, number, number] }) | null = useMemo(() => {
    const focus = cardEvent?.coord ? cardEvent : null;
    if (focus) return { key: `e${focus.id}`, longitude: focus.coord![0], latitude: focus.coord![1], zoom: EVENT_ZOOM };
    if (last?.coord && next?.coord && next.t - year < HOLD.years && km(last.coord, next.coord) < HOLD.km) {
      return { key: `e${last.id}`, longitude: last.coord[0], latitude: last.coord[1], zoom: EVENT_ZOOM };
    }
    const ids = new Set(wars.map((w) => w.id));
    const theatre = boundsOf(pack.events.filter((e) => e.war && ids.has(e.war)));
    const b = theatre ?? boundsOf(pack.events)!;
    const key = theatre ? `w${[...ids].sort().join(',')}` : 'stage';
    return { key, longitude: (b[0] + b[2]) / 2, latitude: (b[1] + b[3]) / 2, zoom: 0, bounds: b };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardEvent?.id, last?.id, next?.id, Math.floor(year / 2), wars.map((w) => w.id).join()]);

  const minutes = useMemo(() => Math.max(1, Math.round(duration(model.clock, s.speed) / 60)), [model, s.speed]);

  const play = () => {
    const st = useReplay.getState();
    if (st.clock.year >= pack.range[1] + 1) st.set({ clock: start(model.clock), card: null, playing: true });
    else st.set({ playing: !st.playing, card: st.card ? { ...st.card, pinned: false } : null });
  };
  const goTo = (vi: number, pin: boolean) => {
    if (vi < 0 || vi >= model.visible.length) return;
    const st = useReplay.getState();
    const base = model.clock.events[vi].dwell;
    st.set({
      clock: { ...stopAt(vi, model.clock), dwell: st.playing && !pin ? dwellAt(base, st.speed) : 0 },
      card: { kind: 'event', index: model.visible[vi], pinned: pin },
      follow: true,
    });
  };
  const prev = () => {
    const st = useReplay.getState();
    goTo(st.card?.kind === 'event' ? st.clock.current - 1 : st.clock.current, false);
  };
  const nextEv = () => goTo(useReplay.getState().clock.cursor, false);
  const pickEvent = (packIndex: number) => {
    const vi = model.visible.indexOf(packIndex);
    if (vi >= 0) goTo(vi, true);
    useReplay.getState().set({ playing: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === ' ') {
        e.preventDefault();
        play();
      } else if (e.key === 'ArrowRight') nextEv();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') useReplay.getState().set({ card: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const progress =
    card && !card.pinned && clock.dwell > 0 && cardEvent
      ? 1 - clock.dwell / dwellAt(model.clock.events[clock.current]?.dwell ?? 1, s.speed)
      : null;

  return (
    <div className={`rp${chart ? ' show-chart' : ''}`}>
      <header className="rp-header">
        <div className="rp-header__title">
          <h1>
            {pack.title[s.lang]} <span>{fmt.range(pack.range[0], pack.range[1])}</span>
          </h1>
          <span className="rp-tag">{t.prototype}</span>
        </div>
        <div className="rp-header__end">
          <button className="rp-link" onClick={() => setAbout(!about)} aria-expanded={about}>
            {t.sources}
          </button>
          <div className="rp-seg" role="group" aria-label="Language">
            {(['en', 'sl'] as Locale[]).map((l) => (
              <button
                key={l}
                aria-pressed={s.lang === l}
                onClick={() => {
                  s.set({ lang: l });
                  try {
                    localStorage.setItem('wht-lang', l);
                  } catch {
                    /* private mode */
                  }
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="rp-stage">
        <Board
          model={model}
          lang={s.lang}
          frame={frame}
          year={year}
          current={cardEvent ?? (last && year - last.t < 0.01 ? last : null)}
          target={target}
          follow={s.follow}
          reducedMotion={reducedMotion}
          onUserMove={() => useReplay.getState().follow && s.set({ follow: false })}
          onPick={pickEvent}
        />
        {(cardEvent || cardWar) && (
          <EventCard
            lang={s.lang}
            item={cardEvent ? { kind: 'event', e: cardEvent } : { kind: 'war', w: cardWar! }}
            war={cardEvent?.war ? model.wars.get(cardEvent.war) ?? null : null}
            pinned={!!card?.pinned || !s.playing}
            progress={s.playing ? progress : null}
            onClose={() => s.set({ card: null })}
            onKeep={() => s.set({ card: card ? { ...card, pinned: true } : null })}
            onResume={() => s.set({ card: null, playing: true })}
          />
        )}
        <Legend lang={s.lang} />
        {about && (
          <aside className="rp-about">
            <p>{t.about}</p>
            <ul>
              {pack.sources.map((src) => (
                <li key={src.name}>
                  <a href={src.url} target="_blank" rel="noreferrer">
                    {src.name}
                  </a>{' '}
                  · {src.licence}
                  {src.retrieved ? ` · ${src.retrieved}` : ''}
                  {src.changes ? ` · ${src.changes}` : ''}
                </li>
              ))}
            </ul>
            <p className="rp-muted">{t.keys}</p>
          </aside>
        )}
      </main>

      <aside className="rp-side">
        <p className="rp-side__title">{t.minimap}</p>
        <Minimap
          model={model}
          lang={s.lang}
          year={year}
          current={card?.kind === 'event' ? card.index : -1}
          activeWar={cardEvent?.war ?? wars[0]?.id ?? null}
          title={t.minimap}
          warsLabel={t.wars}
          onSeek={(y) => s.set({ clock: seek(y, model.clock), card: null })}
          onPickEvent={pickEvent}
          onPickWar={(id) => s.set({ card: { kind: 'war', id, pinned: true }, playing: false })}
        />
      </aside>

      <footer className="rp-foot">
        <Transport
          lang={s.lang}
          playing={s.playing}
          year={year}
          speed={s.speed}
          mode={s.mode}
          follow={s.follow}
          wars={wars}
          position={[Math.max(0, clock.current + 1), model.visible.length]}
          minutes={minutes}
          onPlay={play}
          onPrev={prev}
          onNext={nextEv}
          onRestart={() => s.set({ clock: start(model.clock), card: null, playing: true, follow: true })}
          onSpeed={(v) => s.set({ speed: v })}
          onMode={(m: Mode) => {
            const nm = buildModel(pack, m);
            s.set({ mode: m, clock: seek(year, nm.clock), card: null });
          }}
          onFollow={() => s.set({ follow: !s.follow })}
          onWar={(id) => s.set({ card: { kind: 'war', id, pinned: true }, playing: false })}
          chartOpen={chart}
          onChart={() => setChart(!chart)}
          chartLabel={t.chart}
        />
      </footer>
    </div>
  );
}

function Legend({ lang }: { lang: Locale }) {
  const t = strings(lang);
  return (
    <ul className="rp-legend" aria-label="Legend">
      <li>
        <i className="sw sw--rome" /> {t.legendRome}
      </li>
      <li>
        <i className="sw sw--state" /> {t.legendStates}
      </li>
      <li>
        <i className="sw sw--none" /> {t.legendNone}
      </li>
      <li>
        <i className="sw sw--event" /> {t.legendEvent}
      </li>
      <li>
        <i className="sw sw--now" /> {t.legendNow}
      </li>
    </ul>
  );
}
