import type { Span, Year } from '@/data/types';

export type DetailLevel = 'major' | 'all';

/**
 * "major" keeps tiers 1–2, plus any smaller state that is the only record for
 * at least half of its own years, so a column is not left blank when the source
 * only knows a small state there (the Olmec in Mexico, the Pueblo systems in the
 * United States). "all" keeps everything.
 */
export function filterByDetail(spans: Span[], level: DetailLevel): Span[] {
  if (level === 'all') return spans;
  // Years covered by any major span, merged into disjoint runs.
  const runs: Array<[Year, Year]> = [];
  for (const m of spans.filter((s) => s.tier <= 2).sort((a, b) => a.from - b.from)) {
    const last = runs[runs.length - 1];
    if (last && m.from <= last[1] + 1) last[1] = Math.max(last[1], m.to);
    else runs.push([m.from, m.to]);
  }
  return spans.filter((s) => {
    if (s.tier <= 2) return true;
    let covered = 0;
    for (const [a, b] of runs) covered += Math.max(0, Math.min(b, s.to) - Math.max(a, s.from) + 1);
    const length = s.to - s.from + 1;
    return (length - covered) * 2 >= length;
  });
}

/** Spans active in `year`, most dominant first; unmapped states after mapped ones of the same tier. */
export const spansAt = (spans: Span[], year: Year) =>
  spans
    .filter((s) => s.from <= year && year <= s.to)
    .sort((a, b) => a.tier - b.tier || (b.peak ?? -1) - (a.peak ?? -1));
