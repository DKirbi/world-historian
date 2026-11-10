import type { Locale } from '@/i18n/locales';
import { createFmt } from '@/i18n/format';
import { strings } from './text';
import type { Mode } from './model';
import type { ReplayWar } from './types';

interface Props {
  lang: Locale;
  playing: boolean;
  year: number;
  speed: 1 | 2 | 4;
  mode: Mode;
  follow: boolean;
  wars: ReplayWar[];
  position: [number, number];
  minutes: number;
  onPlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRestart: () => void;
  onSpeed: (s: 1 | 2 | 4) => void;
  onMode: (m: Mode) => void;
  onFollow: () => void;
  onWar: (id: string) => void;
  chartOpen: boolean;
  onChart: () => void;
  chartLabel: string;
}

export function Transport(p: Props) {
  const t = strings(p.lang);
  const fmt = createFmt(p.lang);
  const y = Math.floor(p.year);
  return (
    <div className="rp-transport" role="toolbar" aria-label="Replay">
      <div className="rp-transport__buttons">
        <button className="rp-icon" onClick={p.onRestart} aria-label={t.restart} title={t.restart}>
          ⏮
        </button>
        <button className="rp-icon" onClick={p.onPrev} aria-label={t.prev} title={t.prev}>
          ◀
        </button>
        <button className="rp-play" onClick={p.onPlay} aria-label={p.playing ? t.pause : t.play}>
          {p.playing ? '❚❚' : '▶'}
          <span>{p.playing ? t.pause : t.play}</span>
        </button>
        <button className="rp-icon" onClick={p.onNext} aria-label={t.next} title={t.next}>
          ▶
        </button>
      </div>
      <div className="rp-transport__year" aria-live="off">
        <span className="rp-year">{fmt.year(y)}</span>
        <span className="rp-transport__wars">
          {p.wars.slice(0, 2).map((w) => (
            <button key={w.id} className="rp-chip" onClick={() => p.onWar(w.id)}>
              {(p.lang === 'sl' && w.sl) || w.label}
            </button>
          ))}
        </span>
      </div>
      <div className="rp-transport__settings">
        <span className="rp-muted rp-hide-phone">{t.of(p.position[0], p.position[1])}</span>
        <div className="rp-seg" role="group" aria-label={t.speed}>
          {([1, 2, 4] as const).map((s) => (
            <button key={s} aria-pressed={p.speed === s} onClick={() => p.onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <div className="rp-seg" role="group">
          {(['major', 'all'] as const).map((m) => (
            <button key={m} aria-pressed={p.mode === m} onClick={() => p.onMode(m)}>
              {m === 'major' ? t.major : t.all}
            </button>
          ))}
        </div>
        <button className={`rp-btn rp-only-phone${p.chartOpen ? ' is-on' : ''}`} onClick={p.onChart} aria-pressed={p.chartOpen}>
          {p.chartLabel}
        </button>
        <button className={`rp-btn${p.follow ? ' is-on' : ''}`} onClick={p.onFollow} aria-pressed={p.follow}>
          {p.follow ? t.following : t.follow}
        </button>
        <span className="rp-muted rp-hide-phone">{t.remaining(p.minutes)}</span>
      </div>
    </div>
  );
}
