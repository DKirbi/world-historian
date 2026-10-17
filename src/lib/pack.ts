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
