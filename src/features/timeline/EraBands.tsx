import type { Period } from '@/data/types';
import type { TimeScale } from '@/lib/time';
import s from './Timeline.module.scss';

/** Alternating background bands for the named periods, behind every lane. */
export function EraBands({ periods, scale, width }: { periods: Period[]; scale: TimeScale; width: number }) {
  return (
    <g aria-hidden="true">
      {periods.map((p, i) =>
        i % 2 === 1 ? (
          <rect
            key={p.id}
            className={s.band}
            x={0}
            y={scale(p.years[0])}
            width={width}
            height={scale(p.years[1] + 1) - scale(p.years[0])}
          />
        ) : null,
      )}
    </g>
  );
}
