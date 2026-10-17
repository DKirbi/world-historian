import { describe, expect, it } from 'vitest';
import type { Span } from '@/data/types';
import { packLane } from '../pack';
import { createTimeScale, yearAt, TIME_BREAKS } from '../time';
import { timeTicks } from '../ticks';
import { formatEventDate, formatRange, formatSpanRange, formatSpanShare, formatWdTime, formatYear } from '../format';
import { thinEvents } from '../events';
import type { Era, HistEvent } from '@/data/types';
import { wrapLabel } from '../labels';
import { filterByDetail, spansAt } from '../spans';
import { assembleRegion } from '@/data/source';

const span = (id: string, from: number, to: number, peak = 0.9): Span => ({
  id,
  name: id,
  from,
  to,
  peak,
  tier: peak >= 0.5 ? 1 : peak >= 0.2 ? 2 : 3,
});

describe('time scale', () => {
  it('maps the break years onto the configured fractions', () => {
    const s = createTimeScale(1000);
    expect(s(TIME_BREAKS[0])).toBe(0);
    expect(s(-800)).toBeCloseTo(100);
    expect(s(500)).toBeCloseTo(340);
    expect(s(2025)).toBeCloseTo(1000);
  });
  it('applies zoom and translation', () => {
    const s = createTimeScale(1000, 2, -200);
    expect(s(-3400)).toBe(-200);
    expect(s(2025)).toBeCloseTo(1800);
  });
  it('finds the year under a pixel', () => {
    const s = createTimeScale(1000);
    expect(yearAt(s, s(1500) + 0.1)).toBe(1500);
    expect(yearAt(s, -50)).toBe(-3400);
  });
});

describe('ticks', () => {
  it('are increasing and at least 60% of the gap apart', () => {
    const s = createTimeScale(800);
    const t = timeTicks(s, 0, 800);
    expect(t.length).toBeGreaterThan(5);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]).toBeGreaterThan(t[i - 1]);
      expect(s(t[i]) - s(t[i - 1])).toBeGreaterThanOrEqual(44 * 0.6);
    }
  });
  it('get finer when zoomed in', () => {
    const coarse = timeTicks(createTimeScale(800), 0, 800);
    const zoomed = createTimeScale(800, 40, -40 * createTimeScale(800)(1900));
    const fine = timeTicks(zoomed, 0, 800);
    expect(fine[1] - fine[0]).toBeLessThan(coarse[coarse.length - 1] - coarse[coarse.length - 2]);
  });
});

describe('packLane', () => {
  it('gives a lone span the full width', () => {
    const [p] = packLane([span('a', 0, 100)]);
    expect(p).toMatchObject({ col: 0, cols: 1 });
  });
  it('puts the dominant polity in the left column and never overlaps', () => {
    const big = span('big', 0, 500, 0.95);
    const small = span('small', 100, 200, 0.1);
    const later = span('later', 600, 700, 0.9);
    const placed = packLane([small, big, later]);
    const byId = Object.fromEntries(placed.map((p) => [p.span.id, p]));
    expect(byId.big.col).toBe(0);
    expect(byId.small.col).toBe(1);
    expect(byId.big.cols).toBe(2);
    expect(byId.later).toMatchObject({ col: 0, cols: 1 });
  });
});

describe('format', () => {
  it('writes BCE/CE ranges compactly', () => {
    expect(formatYear(-27)).toBe('27 BCE');
    expect(formatRange(-550, -330)).toBe('550–330 BCE');
    expect(formatRange(-27, 395)).toBe('27 BCE – 395 CE');
    expect(formatRange(476, 999)).toBe('476–999 CE');
    expect(formatRange(990, 1791)).toBe('990–1791');
  });
});

describe('wrapLabel', () => {
  it('wraps on words and ellipsizes overflow', () => {
    expect(wrapLabel('Kingdom of France', 20, 2)).toEqual(['Kingdom of France']);
    expect(wrapLabel('Kingdom of France', 10, 2)).toEqual(['Kingdom of', 'France']);
    expect(wrapLabel('Holy Roman Empire Minor States', 10, 2)).toEqual(['Holy Roman', 'Empire…']);
    expect(wrapLabel('Anything', 2, 2)).toEqual([]);
  });
});

describe('spansAt', () => {
  it('returns active spans, most dominant first', () => {
    const r = spansAt([span('minor', 0, 100, 0.1), span('major', 50, 150, 0.8)], 60);
    expect(r.map((s) => s.id)).toEqual(['major', 'minor']);
  });
});

describe('filterByDetail', () => {
  it('keeps a small state where no major one is recorded, and drops it where one is', () => {
    const major = span('maya', 300, 850, 0.6);
    const lonely = span('olmec', -650, -351, 0.01);
    const shadowed = span('teotihuacan', 400, 700, 0.01);
    const kept = filterByDetail([major, lonely, shadowed], 'major').map((s) => s.id);
    expect(kept).toEqual(['maya', 'olmec']);
    expect(filterByDetail([major, lonely, shadowed], 'all')).toHaveLength(3);
  });
});

describe('assembleRegion', () => {
  it('dedupes spans that cross period files', () => {
    const files: Record<string, unknown> = {
      'x/_index.json': {
        region: 'x',
        generated: '',
        sources: [],
        periods: [],
        tiers: {},
        params: {},
        lanes: [
          {
            id: 'l',
            label: 'L',
            group: 'g',
            order: 0,
            km2: 1,
            minShare: 0.05,
            periods: ['p1', 'p2'],
            spans: 1,
          },
        ],
      },
      'x/_polities.json': {
        region: 'x',
        source: '',
        polities: [{ id: 'a', name: 'A', years: [0, 10] }],
      },
      'x/l/p1.json': { spans: [span('a', 0, 10)], events: [ev('Q1', 5, 30)] },
      'x/l/p2.json': { spans: [span('a', 0, 10)] },
    };
    const region = assembleRegion('x', (p) => files[p]);
    expect(region.spansByLane.l).toHaveLength(1);
    expect(region.appearances.a).toHaveLength(1);
    expect(region.eventsByLane.l.map((e) => e.id)).toEqual(['Q1']);
    expect(region.events.Q1.laneIds).toEqual(['l']);
  });
});

function ev(id: string, year: number, links: number, extra: Partial<HistEvent> = {}): HistEvent {
  return {
    id,
    name: id,
    year,
    links,
    type: 'battle',
    by: 'coordinates',
    ...extra,
  };
}

describe('key events', () => {
  const y = (year: number) => year; // 1 px per year
  it('keeps the most widely documented event where markers collide', () => {
    const shown = thinEvents([ev('a', 100, 20), ev('b', 105, 90), ev('c', 160, 15)], y, [0, 1000], 22, 30);
    expect(shown.map((s) => s.event.id)).toEqual(['b', 'c']);
  });
  it('labels only markers with room around them', () => {
    const shown = thinEvents([ev('a', 100, 20), ev('b', 125, 30), ev('c', 300, 15)], y, [0, 1000], 22, 30);
    expect(shown.map((s) => [s.event.id, s.labeled])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
    ]);
  });
  it('drops events outside the visible range', () => {
    expect(thinEvents([ev('a', 2000, 20)], y, [0, 1000], 22, 30)).toHaveLength(0);
  });
  it('formats dates with their precision', () => {
    expect(formatEventDate(ev('a', 1066, 1))).toBe('1066');
    expect(formatEventDate(ev('a', 1337, 1, { to: 1453 }))).toBe('1337–1453');
    expect(formatEventDate(ev('a', 1500, 1, { prec: 7 }))).toBe('c. 1500');
    expect(formatEventDate(ev('a', 1620, 1, { prec: 8 }))).toBe('1620s');
    expect(formatWdTime([1600, 8])).toBe('1600s');
    expect(formatWdTime([1600, 7])).toBe('16th century');
    expect(formatWdTime([2100, 7])).toBe('21st century');
    expect(formatWdTime([-3500, 7])).toBe('35th century BCE');
    expect(formatWdTime([1112, 7])).toBe('12th century');
    expect(formatWdTime([-1300, 8])).toBe('1300s BCE');
    expect(formatWdTime([1894, 11])).toBe('1894');
  });
});

describe('unmapped states', () => {
  const unmapped: Span = {
    id: 'u',
    name: 'U',
    from: 1000,
    to: 1420,
    tier: 2,
    extent: 'unknown',
    approx: true,
  };
  it('reads as not mapped, with approximate years', () => {
    expect(formatSpanShare(unmapped)).toBe('not mapped');
    expect(formatSpanRange(unmapped)).toBe('c. 1000–1420');
    expect(formatSpanShare(span('m', 0, 1, 0.62))).toBe('62%');
  });
  it('sorts after mapped states of the same tier at a year', () => {
    expect(spansAt([unmapped, span('m', 900, 1500, 0.3)], 1200).map((s) => s.id)).toEqual(['m', 'u']);
  });
});

describe('levels', () => {
  it('follows the visible span, with hysteresis at the edges', async () => {
    const { levelForSpan } = await import('../levels');
    expect(levelForSpan(5000)).toBe(1);
    expect(levelForSpan(1000)).toBe(2);
    expect(levelForSpan(300)).toBe(3);
    expect(levelForSpan(80)).toBe(4);
    expect(levelForSpan(1450, 1)).toBe(1); // just under 1500: stays on Eras
    expect(levelForSpan(1300, 1)).toBe(2);
  });
  it('picks one leader per year for the Empires level', async () => {
    const { leaderSegments } = await import('../levels');
    const segs = leaderSegments([
      span('rome', 0, 400, 0.9),
      span('gaul', -100, 50, 0.3),
      span('franks', 400, 800, 0.7),
    ]);
    expect(segs.map((x) => [x.span.id, x.from, x.to])).toEqual([
      ['gaul', -100, -1],
      ['rome', 0, 400],
      ['franks', 401, 800],
    ]);
  });
  it('lets periods that share a boundary year follow each other', async () => {
    const { placeEras } = await import('../levels');
    const era = (id: string, from: number, to: number) =>
      ({ id, area: 'a', name: id, from, to, lanes: ['x', 'y'], leaders: [], leadersBy: null }) as Era;
    const placed = placeEras(
      [era('archaic', -3400, -2000), era('early', -2000, -1000), era('late', -1200, 0)],
      new Map([
        ['x', 0],
        ['y', 1],
      ]),
    );
    const byId = Object.fromEntries(placed.map((p) => [p.era.id, p]));
    expect(byId.archaic.cols).toBe(1);
    expect(byId.archaic.endsAtNext).toBe(true);
    expect(byId.early.cols).toBe(2); // overlaps 'late' for 200 years
    expect([byId.early.first, byId.early.last]).toEqual([0, 1]);
  });
  it('widens the lanes only once time is zoomed in, up to the lane limit', async () => {
    const { laneZoom, LANE_ZOOM_FROM } = await import('../../features/timeline/useTimelineZoom');
    expect(laneZoom(1, 108, 520)).toBe(1);
    expect(laneZoom(LANE_ZOOM_FROM, 108, 520)).toBe(1);
    const mid = laneZoom(20, 108, 520);
    expect(mid).toBeGreaterThan(2);
    expect(mid).toBeLessThan(520 / 108);
    expect(laneZoom(200, 108, 520)).toBeCloseTo(520 / 108, 6); // capped at the lane limit
    expect(laneZoom(200, 320, 200)).toBe(1); // a lane already wider than the limit does not shrink
  });
  it('keeps the point under the gesture where it was when the lanes widen', async () => {
    const { anchoredTx } = await import('../../features/timeline/useTimelineZoom');
    // lane 2 starts at 2 * 100 = 200 px of content, scrolled by -50: it is at 150 px on screen
    const tx = -50;
    const c = 180; // fingers on lane 2, 30 px into it
    const next = anchoredTx(tx, c, c, 100, 250);
    expect(next + (2 * 250 + (30 / 100) * 250)).toBeCloseTo(c, 6); // same point still under the fingers
    // a pinch whose centre moves 20 px right carries the lanes along
    expect(anchoredTx(tx, c, c + 20, 100, 100)).toBeCloseTo(tx + 20, 6);
  });
  it('shares the width only for the years two periods overlap', async () => {
    const { placeEras } = await import('../levels');
    const era = (id: string, from: number, to: number) =>
      ({ id, area: 'a', name: id, from, to, lanes: ['x'], leaders: [], leadersBy: null }) as Era;
    const placed = placeEras([era('woodland', 500, 1000), era('mississippian', 900, 1500)], new Map([['x', 0]]));
    const byId = Object.fromEntries(placed.map((p) => [p.era.id, p]));
    expect(byId.woodland.slots).toEqual([
      { from: 500, to: 900, slot: 0, of: 1 },
      { from: 900, to: 1000, slot: 0, of: 2 },
    ]);
    expect(byId.mississippian.slots).toEqual([
      { from: 900, to: 1000, slot: 1, of: 2 },
      { from: 1000, to: 1500, slot: 0, of: 1 },
    ]);
  });
  it('does not split the width between eras of different columns', async () => {
    const { placeEras } = await import('../levels');
    const era = (id: string, from: number, to: number, lanes: string[]) =>
      ({ id, area: 'a', name: id, from, to, lanes, leaders: [], leadersBy: null }) as Era;
    const placed = placeEras(
      [era('egypt', -29, 631, ['x']), era('libya', -539, 631, ['y']), era('after', 632, 1499, ['x', 'y'])],
      new Map([
        ['x', 0],
        ['y', 1],
      ]),
    );
    const byId = Object.fromEntries(placed.map((p) => [p.era.id, p]));
    expect([byId.egypt.col, byId.egypt.cols]).toEqual([0, 1]);
    expect([byId.libya.col, byId.libya.cols]).toEqual([0, 1]);
    expect(byId.egypt.endsAtNext).toBe(false); // 'after' starts the year after, not in the same year
  });
});
