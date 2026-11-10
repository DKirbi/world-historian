/**
 * The replay's clock: a playhead that runs through the years and stops on each event long enough to read it.
 *
 * Years pass slowly while one of the replay's wars is under way and quickly between wars, and never so slowly that
 * the next event is more than a few seconds away: screen time goes to the events, not to the quiet decades. The
 * clock is pure: `advance` takes the state and the elapsed time and returns the next state, which keeps it
 * testable and lets the page drive it from requestAnimationFrame.
 */

export interface ClockEvent {
  t: number;
  /** Seconds the card stays up at 1× (longer for an event with a text to read). */
  dwell: number;
}

export interface ClockState {
  /** The playhead, a fractional year (−216.41 is early August 216 BCE). */
  year: number;
  /** Index of the next event to stop at. */
  cursor: number;
  /** Seconds left on the current stop; 0 when the playhead is moving. */
  dwell: number;
  /** The event the playhead is stopped on (or last stopped on), −1 before the first. */
  current: number;
}

export interface ClockConfig {
  range: [number, number];
  events: ClockEvent[];
  /** Fractional-year intervals of the wars, for the pace. */
  wars: [number, number][];
}

/** Years per second at 1×; `reach` is the most seconds the playhead may take to the next event. */
export const PACE = { war: 1.5, peace: 6, reach: 2.5 };

export function pace(year: number, wars: [number, number][], next?: number): number {
  const base = wars.some(([a, b]) => year >= a && year < b) ? PACE.war : PACE.peace;
  return next === undefined ? base : Math.max(base, (next - year) / PACE.reach);
}

/** A card's stop shortens with speed, but less than the years do, so a faster replay stays readable. */
export function dwellAt(base: number, speed: number): number {
  return base / Math.sqrt(speed);
}

export function start(cfg: ClockConfig): ClockState {
  return { year: cfg.range[0], cursor: 0, dwell: 0, current: -1 };
}

export interface Step {
  state: ClockState;
  /** The event the playhead stopped on in this step, if any. */
  fired: number | null;
  ended: boolean;
}

export function advance(s: ClockState, dt: number, speed: number, cfg: ClockConfig): Step {
  const end = cfg.range[1] + 1;
  if (s.dwell > 0) {
    return { state: { ...s, dwell: Math.max(0, s.dwell - dt) }, fired: null, ended: false };
  }
  let year = s.year;
  let left = dt;
  // Integrate the pace in small slices so a war's start or end inside one frame changes the pace on time.
  while (left > 1e-9) {
    const slice = Math.min(left, 0.05);
    const ev = cfg.events[s.cursor];
    const next = year + slice * pace(year, cfg.wars, ev?.t) * speed;
    if (ev && next >= ev.t) {
      return {
        state: { year: ev.t, cursor: s.cursor + 1, dwell: dwellAt(ev.dwell, speed), current: s.cursor },
        fired: s.cursor,
        ended: false,
      };
    }
    year = next;
    left -= slice;
    if (year >= end) return { state: { ...s, year: end, dwell: 0 }, fired: null, ended: true };
  }
  return { state: { ...s, year }, fired: null, ended: false };
}

/** Put the playhead on a year (a scrub): the next stop is the first event after it, the current one the last before. */
export function seek(year: number, cfg: ClockConfig): ClockState {
  const y = Math.min(Math.max(year, cfg.range[0]), cfg.range[1] + 1);
  let cursor = cfg.events.findIndex((e) => e.t > y);
  if (cursor < 0) cursor = cfg.events.length;
  return { year: y, cursor, dwell: 0, current: cursor - 1 };
}

/** Stop on an event (a click on its dot, or ← / →); the card stays until the reader moves on. */
export function stopAt(index: number, cfg: ClockConfig): ClockState {
  const ev = cfg.events[index];
  return { year: ev.t, cursor: index + 1, dwell: 0, current: index };
}

/** How long the whole replay runs at a speed, in seconds (for the transport's estimate). */
export function duration(cfg: ClockConfig, speed: number): number {
  let s = start(cfg);
  let total = 0;
  const dt = 0.25;
  for (let guard = 0; guard < 200000; guard++) {
    const step = advance(s, dt, speed, cfg);
    total += dt;
    if (step.ended) break;
    s = step.state;
  }
  return total;
}
