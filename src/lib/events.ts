import type { EventType, HistEvent, Year } from '@/data/types';

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  battle: 'Battle',
  siege: 'Siege',
  invasion: 'Invasion',
  campaign: 'Military campaign',
  war: 'War',
  revolution: 'Revolution',
  rebellion: 'Rebellion',
  coup: 'Coup',
  treaty: 'Treaty',
  pandemic: 'Pandemic',
};

export interface ShownEvent {
  event: HistEvent;
  y: number;
  /** Room for a text label: no other shown marker within the label gap. */
  labeled: boolean;
}

/**
 * Level of detail for one lane: keep the most widely documented events (most Wikipedia language
 * editions) and drop any that would sit closer than `minGap` px to one already kept. Zooming in
 * spreads the years apart, so more events appear. Events are sorted by year on return.
 */
export function thinEvents(
  events: HistEvent[],
  yOf: (year: Year) => number,
  range: [number, number],
  minGap: number,
  labelGap: number,
): ShownEvent[] {
  const [top, bottom] = range;
  const candidates = events
    .map((event) => ({ event, y: yOf(event.year + 0.5) }))
    .filter((c) => c.y >= top - minGap && c.y <= bottom + minGap)
    .sort((a, b) => b.event.links - a.event.links || a.event.year - b.event.year);
  const kept: Array<{ event: HistEvent; y: number }> = [];
  const ys: number[] = []; // sorted y positions of kept markers
  const nearest = (y: number) => {
    let lo = 0;
    let hi = ys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ys[mid] < y) lo = mid + 1;
      else hi = mid;
    }
    let d = Infinity;
    if (lo < ys.length) d = Math.min(d, ys[lo] - y);
    if (lo > 0) d = Math.min(d, y - ys[lo - 1]);
    return { d, at: lo };
  };
  for (const c of candidates) {
    const { d, at } = nearest(c.y);
    if (d < minGap) continue;
    ys.splice(at, 0, c.y);
    kept.push(c);
  }
  return kept
    .sort((a, b) => a.y - b.y)
    .map((c, i, all) => {
      const prev = i > 0 ? c.y - all[i - 1].y : Infinity;
      const next = i < all.length - 1 ? all[i + 1].y - c.y : Infinity;
      return { ...c, labeled: Math.min(prev, next) >= labelGap };
    });
}
