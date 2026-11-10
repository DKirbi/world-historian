import { describe, expect, it } from 'vitest';
import { advance, dwellAt, pace, PACE, seek, start, stopAt, type ClockConfig } from './clock';
import { frameAt } from './board';

const cfg: ClockConfig = {
  range: [-300, -200],
  events: [
    { t: -280.5, dwell: 4 },
    { t: -280.5, dwell: 4 },
    { t: -250.2, dwell: 2 },
  ],
  wars: [[-282, -270]],
};

describe('clock', () => {
  it('runs fast between wars and slowly during them', () => {
    expect(pace(-290, cfg.wars)).toBe(PACE.peace);
    expect(pace(-275, cfg.wars)).toBe(PACE.war);
    expect(pace(-270, cfg.wars)).toBe(PACE.peace);
  });

  it('never leaves the next event more than a few seconds away', () => {
    expect(pace(-281, cfg.wars, -280.5)).toBe(PACE.war);
    expect(pace(-279, cfg.wars, -250.2)).toBeCloseTo((-250.2 + 279) / PACE.reach);
  });

  it('stops on each event in order, also on two at the same moment', () => {
    let s = start(cfg);
    const fired: number[] = [];
    for (let i = 0; i < 10000 && fired.length < 3; i++) {
      const step = advance(s, 0.1, 1, cfg);
      if (step.fired !== null) fired.push(step.fired);
      s = step.state;
    }
    expect(fired).toEqual([0, 1, 2]);
    expect(s.year).toBeCloseTo(-250.2);
    expect(s.current).toBe(2);
  });

  it('holds the playhead while a card is up', () => {
    const s = { ...stopAt(0, cfg), dwell: 3 };
    const step = advance(s, 1, 1, cfg);
    expect(step.state.year).toBe(s.year);
    expect(step.state.dwell).toBe(2);
    expect(step.fired).toBeNull();
  });

  it('ends at the last year', () => {
    let s = seek(-251, cfg);
    s = { ...s, cursor: cfg.events.length };
    let ended = false;
    for (let i = 0; i < 1000 && !ended; i++) {
      const step = advance(s, 0.5, 4, cfg);
      ended = step.ended;
      s = step.state;
    }
    expect(ended).toBe(true);
    expect(s.year).toBe(-199);
  });

  it('seeks to the next event after a year', () => {
    expect(seek(-281, cfg).cursor).toBe(0);
    expect(seek(-280.5, cfg).cursor).toBe(2);
    expect(seek(-280.5, cfg).current).toBe(1);
    expect(seek(-100, cfg).cursor).toBe(3);
  });

  it('shortens stops less than it speeds the years', () => {
    expect(dwellAt(4, 4)).toBe(2);
  });
});

describe('frameAt', () => {
  const frames = [-343, -337, -333, -301, -264];
  it('takes the last border change at or before the year', () => {
    expect(frameAt(frames, -343)).toBe(0);
    expect(frameAt(frames, -336.5)).toBe(1);
    expect(frameAt(frames, -333)).toBe(2);
    expect(frameAt(frames, -265)).toBe(3);
    expect(frameAt(frames, -100)).toBe(4);
    expect(frameAt(frames, -400)).toBe(0);
  });
});
