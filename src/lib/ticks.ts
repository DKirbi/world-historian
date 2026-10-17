import type { Year } from '@/data/types';
import { TIME_BREAKS, type TimeScale } from './time';

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * Year ticks for the visible window. Each segment of the piecewise scale picks
 * its own step so labels stay at least `minGap` px apart at any zoom level.
 */
export function timeTicks(scale: TimeScale, viewTop: number, viewBottom: number, minGap = 44): Year[] {
  const y0 = scale.invert(viewTop);
  const y1 = scale.invert(viewBottom);
  const ticks: Year[] = [];
  for (let i = 0; i < TIME_BREAKS.length - 1; i++) {
    const a = TIME_BREAKS[i];
    const b = TIME_BREAKS[i + 1];
    const lo = Math.max(a, y0);
    const hi = Math.min(b, y1);
    if (lo >= hi) continue;
    const pxPerYear = (scale(b) - scale(a)) / (b - a);
    const step = STEPS.find((s) => s * pxPerYear >= minGap) ?? 1000 * Math.ceil(minGap / (1000 * pxPerYear));
    for (let t = Math.ceil(lo / step) * step; t < hi; t += step) ticks.push(t);
  }
  // Drop ticks that crowd each other where two segments meet.
  const out: Year[] = [];
  for (const t of ticks) {
    const prev = out[out.length - 1];
    if (prev === undefined || scale(t) - scale(prev) >= minGap * 0.6) out.push(t);
  }
  return out;
}
