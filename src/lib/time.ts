import { scaleLinear, type ScaleLinear } from 'd3-scale';
import type { Year } from '@/data/types';

/**
 * Piecewise time axis. Like a printed wall chart, deep antiquity is compressed
 * and recent centuries get more room. Break years and the share of the chart
 * height each segment receives at zoom 1:
 *   3400 BCE – 800 BCE : 10%
 *    800 BCE – 500 CE  : 24%
 *    500 CE  – 1500    : 30%
 *   1500     – 2024    : 36%
 * The domain end is 2025 because a span's last year is drawn to the start of the next.
 */
export const TIME_BREAKS: readonly Year[] = [-3400, -800, 500, 1500, 2025];
const WEIGHTS = [0.1, 0.24, 0.3, 0.36];
export const TIME_FRACTIONS: readonly number[] = WEIGHTS.reduce<number[]>(
  (acc, w) => [...acc, acc[acc.length - 1] + w],
  [0],
);
export const TIME_MIN = TIME_BREAKS[0];
export const TIME_MAX = TIME_BREAKS[TIME_BREAKS.length - 1] - 1;

export type TimeScale = ScaleLinear<number, number>;

/** Pixel position of a year for a plot of `height` px at zoom `k` translated by `ty`. */
export function createTimeScale(height: number, k = 1, ty = 0): TimeScale {
  return scaleLinear<number, number>()
    .domain([...TIME_BREAKS])
    .range(TIME_FRACTIONS.map((f) => f * height * k + ty));
}

/** Position as a fraction of full chart height at zoom 1 (used to compute zoom targets). */
export const baseFraction = createTimeScale(1);

/** The year whose drawn interval contains pixel `py`. */
export const yearAt = (scale: TimeScale, py: number): Year =>
  Math.min(TIME_MAX, Math.max(TIME_MIN, Math.floor(scale.invert(py))));
