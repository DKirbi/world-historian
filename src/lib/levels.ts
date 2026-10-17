import type { Era, Span, Year } from '@/data/types';

/**
 * Four levels of detail, from the wall-chart overview to every record.
 * 1 Eras      culture-area periods (few, large blocks)
 * 2 Empires   the leading state or culture of each country, merged across neighbouring columns
 * 3 States    the major states of each country (the old "Major powers")
 * 4 Detail    every state, city-state, culture and key event
 * The level follows the visible time span, like the zoom levels of a map.
 */
export type Level = 1 | 2 | 3 | 4;

export const LEVELS: ReadonlyArray<{
  level: Level;
  id: string;
  label: string;
  hint: string;
}> = [
  { level: 1, id: 'eras', label: 'Eras', hint: 'Periods of each culture area' },
  {
    level: 2,
    id: 'empires',
    label: 'Empires',
    hint: 'The leading state or culture of each country',
  },
  {
    level: 3,
    id: 'states',
    label: 'States',
    hint: 'The major states of each country',
  },
  {
    level: 4,
    id: 'detail',
    label: 'Detail',
    hint: 'Every state, culture and key event',
  },
];

/** Visible years at which the level changes: more than 1,500 years is Eras, 450–1,500 Empires… */
export const LEVEL_SPANS: Readonly<Record<1 | 2 | 3, number>> = {
  1: 1500,
  2: 450,
  3: 120,
};
/** Years shown when the level control jumps to a level, centred on the year marker. */
export const LEVEL_TARGET: Readonly<Record<Level, number | null>> = {
  1: null,
  2: 900,
  3: 280,
  4: 70,
};
const HYSTERESIS = 0.08;

/** Level for a visible span of `years`, keeping `prev` near a threshold so it does not flicker. */
export function levelForSpan(years: number, prev?: Level): Level {
  const raw: Level = years > LEVEL_SPANS[1] ? 1 : years > LEVEL_SPANS[2] ? 2 : years > LEVEL_SPANS[3] ? 3 : 4;
  if (!prev || prev === raw) return raw;
  // between two levels, stay put until the span is clearly past the threshold
  const edge = LEVEL_SPANS[Math.min(prev, raw) as 1 | 2 | 3];
  return Math.abs(years - edge) < edge * HYSTERESIS ? prev : raw;
}

export interface Segment {
  /** The leading span of this run of years. */
  span: Span;
  from: Year;
  to: Year;
}

const rank = (s: Span) => [s.tier, s.peak === undefined ? 1 : 0, -(s.peak ?? 0), -(s.to - s.from)];
const better = (a: Span, b: Span) => {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i];
  return false;
};

/**
 * The Empires level for one column: at every year the single leading record (lowest tier, mapped
 * before unmapped, largest share, then longest), as consecutive runs.
 */
export function leaderSegments(spans: Span[]): Segment[] {
  if (!spans.length) return [];
  const points = [...new Set(spans.flatMap((s) => [s.from, s.to + 1]))].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1] - 1;
    let lead: Span | null = null;
    for (const s of spans) if (s.from <= a && s.to >= a && (!lead || better(s, lead))) lead = s;
    if (!lead) continue;
    const last = out[out.length - 1];
    if (last && last.span.id === lead.id && last.to + 1 === a) last.to = b;
    else out.push({ span: lead, from: a, to: b });
  }
  return out;
}

export interface PlacedEra {
  era: Era;
  /** First and last visible lane index of one contiguous run of the era's columns. */
  first: number;
  last: number;
  col: number;
  cols: number;
  /**
   * The width the block takes over its years: the whole run of columns, or a share of it while other
   * periods of the same columns overlap it. Consecutive stretches [from, to) with their position
   * (slot) among the `of` periods then in the columns.
   */
  slots: Array<{ from: Year; to: Year; slot: number; of: number }>;
  /** The next period of the same area starts in this period's last year. */
  endsAtNext: boolean;
}

/**
 * Lay out eras over the visible lanes: one block per contiguous run of an era's columns. Where two
 * eras of the same area overlap in time and share a column (Late Woodland and Mississippian, 900–1000),
 * each takes a share of the width for the years of the overlap only (`slots`). Eras that overlap in
 * time but cover different columns (two period bins that start in different years) do not share the
 * width.
 */
export function placeEras(eras: Era[], laneIndex: Map<string, number>): PlacedEra[] {
  const out: PlacedEra[] = [];
  const byArea = new Map<string, Era[]>();
  for (const e of eras) (byArea.get(e.area) ?? byArea.set(e.area, []).get(e.area)!).push(e);
  const shares = (a: Era, b: Era) => a.lanes.some((l) => b.lanes.includes(l));
  const overlaps = (a: Era, b: Era) => a.to > b.from && b.to > a.from;
  for (const list of byArea.values()) {
    const sorted = [...list].sort((a, b) => a.from - b.from);
    // the first column where no earlier era both overlaps in time and shares a lane; periods that
    // only share their boundary year ("3500–2000 BCE", "2000–1000 BCE") follow each other
    const colOf = new Map<Era, number>();
    sorted.forEach((e, i) => {
      const taken = new Set<number>();
      for (const q of sorted.slice(0, i)) if (overlaps(q, e) && shares(q, e)) taken.add(colOf.get(q)!);
      let c = 0;
      while (taken.has(c)) c++;
      colOf.set(e, c);
    });
    for (const e of sorted) {
      const rivals = sorted.filter((q) => q !== e && overlaps(q, e) && shares(q, e));
      // stretches of the era's years with the same set of overlapping periods
      const cuts = [...new Set([e.from, e.to, ...rivals.flatMap((q) => [q.from, q.to])])]
        .filter((y) => y >= e.from && y <= e.to)
        .sort((a, b) => a - b);
      const slots: PlacedEra['slots'] = [];
      for (let i = 0; i + 1 < cuts.length; i++) {
        const a = cuts[i];
        const active = [e, ...rivals.filter((q) => q.from <= a && q.to > a)].sort(
          (x, y) => colOf.get(x)! - colOf.get(y)! || x.from - y.from,
        );
        const slot = active.indexOf(e);
        const last = slots[slots.length - 1];
        if (last && last.slot === slot && last.of === active.length) last.to = cuts[i + 1];
        else slots.push({ from: a, to: cuts[i + 1], slot, of: active.length });
      }
      if (!slots.length) slots.push({ from: e.from, to: e.to, slot: 0, of: 1 });
      const cols =
        Math.max(colOf.get(e)!, ...sorted.filter((q) => overlaps(q, e) && shares(q, e)).map((q) => colOf.get(q)!)) + 1;
      const endsAtNext = sorted.some((q) => q.from === e.to && shares(q, e));
      const idx = e.lanes
        .map((l) => laneIndex.get(l))
        .filter((i): i is number => i !== undefined)
        .sort((x, y) => x - y);
      let start = -1;
      idx.forEach((i, k) => {
        if (start < 0) start = i;
        if (k === idx.length - 1 || idx[k + 1] !== i + 1) {
          out.push({ era: e, first: start, last: i, col: colOf.get(e)!, cols, slots, endsAtNext });
          start = -1;
        }
      });
    }
  }
  return out;
}
