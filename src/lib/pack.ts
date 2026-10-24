import type { Span } from '@/data/types';

export interface PlacedSpan {
  span: Span;
  /** Column index inside the lane, 0 = leftmost. */
  col: number;
  /** Columns shared by the cluster of overlapping spans this span belongs to. */
  cols: number;
}

const overlaps = (a: { from: number; to: number }, b: { from: number; to: number }) => a.from <= b.to && b.from <= a.to;

/**
 * Lay out the spans of one lane in side-by-side columns, like the sub-columns
 * of a printed chart. Dominant polities (lower tier, higher share) claim the
 * leftmost column first. Spans that never overlap anything get the full width.
 */
export function packLane(spans: Span[]): PlacedSpan[] {
  const order = [...spans].sort((a, b) => a.tier - b.tier || (b.peak ?? 0) - (a.peak ?? 0) || a.from - b.from);
  const columns: Span[][] = [];
  const colOf = new Map<Span, number>();
  for (const s of order) {
    let c = columns.findIndex((col) => col.every((o) => !overlaps(o, s)));
    if (c < 0) {
      c = columns.length;
      columns.push([]);
    }
    columns[c].push(s);
    colOf.set(s, c);
  }

  // Clusters: chains of spans connected by time overlap share one column count.
  const byFrom = [...spans].sort((a, b) => a.from - b.from);
  const clusterOf = new Map<Span, number>();
  const clusterCols: number[] = [];
  let cluster = -1;
  let end = -Infinity;
  for (const s of byFrom) {
    if (s.from > end) {
      cluster += 1;
      clusterCols[cluster] = 0;
      end = s.to;
    } else {
      end = Math.max(end, s.to);
    }
    clusterOf.set(s, cluster);
    clusterCols[cluster] = Math.max(clusterCols[cluster], colOf.get(s)! + 1);
  }

  return spans.map((span) => ({
    span,
    col: colOf.get(span)!,
    cols: clusterCols[clusterOf.get(span)!],
  }));
}

/** Several spans of one lane gathered into one block because they would be too narrow to read or tap. */
export interface StackBlock {
  from: number;
  to: number;
  /** The gathered spans, most dominant first. */
  spans: Span[];
  col: number;
  cols: number;
}

/** WCAG 2.5.8 asks for pointer targets of at least 24 × 24 CSS px. */
export const MIN_TARGET_PX = 24;

/** Most side-by-side columns a lane of `laneW` px can hold at the minimum target width (at least 2). */
export const maxColumns = (laneW: number) => Math.max(2, Math.floor(laneW / MIN_TARGET_PX));

/**
 * Keep every block at least MIN_TARGET_PX wide. Where a cluster of overlapping spans needs more
 * columns than the lane can hold, the leading columns stay as they are and everything from the last
 * column on is gathered: one "+N" block per run of overlapping years. A run that holds a single span
 * draws that span normally. Zooming in widens the lane, so the gathered spans come apart again.
 */
export function capColumns(placed: PlacedSpan[], maxCols: number): { placed: PlacedSpan[]; stacks: StackBlock[] } {
  const kept: PlacedSpan[] = [];
  const hidden: Span[] = [];
  for (const p of placed) {
    if (p.cols <= maxCols) kept.push(p);
    else if (p.col < maxCols - 1) kept.push({ ...p, cols: maxCols });
    else hidden.push(p.span);
  }
  const stacks: StackBlock[] = [];
  const sorted = [...hidden].sort((a, b) => a.from - b.from);
  let run: Span[] = [];
  let end = -Infinity;
  const flush = () => {
    if (!run.length) return;
    if (run.length === 1) kept.push({ span: run[0], col: maxCols - 1, cols: maxCols });
    else
      stacks.push({
        from: Math.min(...run.map((s) => s.from)),
        to: end,
        spans: [...run].sort((a, b) => a.tier - b.tier || (b.peak ?? 0) - (a.peak ?? 0) || a.from - b.from),
        col: maxCols - 1,
        cols: maxCols,
      });
    run = [];
  };
  for (const s of sorted) {
    if (s.from > end) {
      flush();
      end = s.to;
    } else end = Math.max(end, s.to);
    run.push(s);
  }
  flush();
  return { placed: kept, stacks };
}
