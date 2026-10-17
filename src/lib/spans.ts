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

/** Plain-language reading of the review flags written by the data build. */
export function describeFlag(flag: string, nameOf: (id: string) => string): string {
  const [kind, value = ''] = flag.split(/:(.*)/s);
  switch (kind) {
    case 'shared-wikidata':
      return `Shares its Wikidata entry with ${value.split(',').map(nameOf).join(', ')}.`;
    case 'wikipedia-title-differs':
      return `Linked to the Wikipedia article "${value}".`;
    case 'multiple-wikipedia-titles':
      return 'Linked to more than one Wikipedia article over time.';
    case 'split-incarnation':
      return 'Separated from a same-named record that resumes more than 50 years later.';
    case 'realm-only':
      return 'Recorded only as a realm together with its vassal states.';
    case 'no-wikidata':
      return 'Has no Wikidata entry.';
    case 'wikidata-link-corrected': {
      const [from, to] = value.split(':');
      return from === 'none'
        ? `Linked to Wikidata ${to} through its Wikipedia article.`
        : `The source's Wikidata link (${from}) has dates that do not match this state; linked to ${to}, the item of its Wikipedia article, instead.`;
    }
    case 'wikidata-link-mismatch':
      return `The source's Wikidata link (${value}) has dates that do not match this state, so no Wikidata link is shown.`;
    case 'supplement':
      return 'Not in the map source. Added from Wikidata; its territory is not mapped.';
    case 'dates-from-wikipedia':
      return 'Some dates are quoted from Wikipedia because Wikidata has none or disagrees with the article.';
    case 'dates-approximate':
      return 'Dates are known only to the decade or century, or are given as “c.”.';
    case 'culture':
      return value === 'dated-by-list'
        ? 'A culture from Wikipedia’s lists of pre-Columbian cultures, dated as the list gives it.'
        : value === 'dated-by-wikidata'
          ? 'A culture from Wikipedia’s lists of pre-Columbian cultures, dated by Wikidata because the list gives no dates.'
          : 'A culture from Wikipedia’s lists of pre-Columbian cultures, dated only by the periods it is listed under.';
    case 'placed-by':
      return value === 'capital'
        ? 'Placed in this country by the location of its capital on Wikidata.'
        : value === 'capital-country'
          ? 'Placed in this country by the country of its capital on Wikidata.'
          : value === 'coordinates'
            ? 'Placed in this country by its coordinates on Wikidata.'
            : value === 'source-page'
              ? 'Placed in Peru because it is listed only in the periodization of pre-Columbian Peru.'
              : 'Placed in this country by its country on Wikidata.';
    default:
      return flag;
  }
}
