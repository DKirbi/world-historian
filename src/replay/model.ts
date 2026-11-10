import type { ClockConfig } from './clock';
import type { ReplayEvent, ReplayPack, ReplayWar } from './types';

export type Mode = 'major' | 'all';

/** An event counts as major with articles in at least this many Wikipedia editions (the chart's own importance
 *  proxy), or when the editors added it. */
export const MAJOR_SITELINKS = 20;

const wy = (d: [number, ...unknown[]]) => d[0] as number;

/** A war's years on the time axis: from the start of its first year to the end of its last. */
export function warSpan(w: ReplayWar): [number, number] {
  return [wy(w.start), wy(w.end) + 1];
}

export interface Model {
  pack: ReplayPack;
  events: ReplayEvent[];
  /** Indexes into pack.events of the events shown in this mode, in time order. */
  visible: number[];
  wars: Map<string, ReplayWar>;
  /** Wars drawn as bars and named in the transport: every war that is not an umbrella (an umbrella groups
   *  wars, like the Punic Wars, or outlasts the replay by far, like the Roman–Gallic Wars). */
  bars: ReplayWar[];
  clock: ClockConfig;
}

export function buildModel(pack: ReplayPack, mode: Mode): Model {
  const wars = new Map(pack.wars.map((w) => [w.id, w]));
  const visible = pack.events
    .map((e, i) => [e, i] as const)
    .filter(([e]) => mode === 'all' || e.sitelinks >= MAJOR_SITELINKS || !!e.editorial)
    .map(([, i]) => i);
  const bars = pack.wars.filter((w) => !w.umbrella);
  const clock: ClockConfig = {
    range: pack.range,
    events: visible.map((i) => {
      const e = pack.events[i];
      return { t: e.t, dwell: e.story ? 5 : 3 };
    }),
    wars: bars.map(warSpan),
  };
  return { pack, events: pack.events, visible, wars, bars, clock };
}

/** The wars under way in a year, most specific first. */
export function activeWars(m: Model, year: number): ReplayWar[] {
  return m.bars
    .filter((w) => {
      const [a, b] = warSpan(w);
      return year >= a && year < b;
    })
    .sort((a, b) => warSpan(a)[1] - warSpan(a)[0] - (warSpan(b)[1] - warSpan(b)[0]));
}

/** Bounds [w, s, e, n] around the placed events of the given wars, or of every event. */
export function boundsOf(events: ReplayEvent[]): [number, number, number, number] | null {
  const pts = events.filter((e) => e.coord).map((e) => e.coord!);
  if (!pts.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of pts) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

/** Great-circle distance in km. */
export function km(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLon = (b[0] - a[0]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
