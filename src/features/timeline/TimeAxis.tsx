import type { Period, Year } from '@/data/types';
import type { TimeScale } from '@/lib/time';
import { useI18n } from '@/i18n/useI18n';
import s from './Timeline.module.scss';

interface Props {
  scale: TimeScale;
  ticks: Year[];
  periods: Period[];
  /** Period name in the reader's language. */
  periodName: (p: Period) => string;
  width: number;
  height: number;
  cursorYear: Year;
  onPeriod: (p: Period) => void;
}

const ERA_W = 18;

/** Left gutter: named periods as vertical brackets, year ticks, and the year-marker pill. */
export function TimeAxis({ scale, ticks, periods, periodName, width, height, cursorYear, onPeriod }: Props) {
  const { t, fmt } = useI18n();
  const cy = scale(cursorYear + 0.5);
  const bce = fmt.eraSuffix(-1);
  return (
    <svg className={s.axis} width={width} height={height} aria-hidden="false">
      <g>
        {periods.map((p) => {
          const y0 = Math.max(0, scale(p.years[0]));
          const y1 = Math.min(height, scale(p.years[1] + 1));
          if (y1 - y0 < 6) return null;
          const label = periodName(p);
          const showLabel = y1 - y0 >= label.length * 5.6 + 16;
          return (
            <g
              key={p.id}
              className={s.era}
              role="button"
              tabIndex={0}
              aria-label={t('timeline.periodZoom', { period: label, range: fmt.range(p.years[0], p.years[1]) })}
              onClick={() => onPeriod(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPeriod(p);
                }
              }}
            >
              <rect x={0} y={y0} width={ERA_W} height={y1 - y0} className={s.eraHit} />
              <line x1={ERA_W - 2} x2={ERA_W - 2} y1={y0 + 3} y2={y1 - 3} className={s.eraRule} />
              {showLabel && (
                <text
                  className={s.eraLabel}
                  transform={`translate(${ERA_W - 7},${(y0 + y1) / 2}) rotate(-90)`}
                  textAnchor="middle"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </g>
      <g className={s.ticks}>
        {ticks.map((t) => {
          const y = scale(t);
          if (y < 6 || y > height - 4) return null;
          return (
            <g key={t} transform={`translate(0,${y})`}>
              <line x1={width - 5} x2={width} y1={0} y2={0} />
              <text x={width - 8} y={t < 0 ? 0 : 4} textAnchor="end">
                {t < 0 ? -t : t}
              </text>
              {t < 0 && (
                <text x={width - 8} y={10} textAnchor="end" className={s.tickEra}>
                  {bce}
                </text>
              )}
            </g>
          );
        })}
      </g>
      {cy >= 0 && cy <= height && (
        <g className={s.cursorPill} transform={`translate(${ERA_W + 2},${cy})`}>
          <rect x={0} y={-10} width={width - ERA_W - 2} height={20} rx={10} />
          <text x={(width - ERA_W - 2) / 2} y={4} textAnchor="middle">
            {cursorYear < 0 ? `${-cursorYear} ${bce}` : cursorYear}
          </text>
        </g>
      )}
    </svg>
  );
}
