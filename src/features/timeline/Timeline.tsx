import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Era, HistEvent, Period, RegionData, Span } from '@/data/types';
import { createTimeScale, TIME_MAX, TIME_MIN, yearAt } from '@/lib/time';
import {
  LEVEL_TARGET,
  leaderSegments,
  levelForSpan,
  placeEras,
  type Level,
  type PlacedEra,
  type Segment,
} from '@/lib/levels';
import { timeTicks } from '@/lib/ticks';
import { packLane, type PlacedSpan } from '@/lib/pack';
import { filterByDetail } from '@/lib/spans';
import { thinEvents } from '@/lib/events';
import { useElementSize } from '@/lib/hooks';
import { CHAR_W, measureCharWidth } from '@/lib/labels';
import { formatYear } from '@/lib/format';
import { selectLanes, useTimeline } from '@/state/store';
import { Button } from '@/components/ui/Button';
import { regionMeta } from '@/data/regions';
import { useTimelineZoom } from './useTimelineZoom';
import { TimeAxis } from './TimeAxis';
import { EraBands } from './EraBands';
import { LaneHeaders } from './LaneHeaders';
import { SpanBlock } from './SpanBlock';
import { EventTooltip, SpanTooltip } from './SpanTooltip';
import { EventMarkers } from './EventMarkers';
import { EraBlocks } from './EraBlocks';
import { LeaderBlocks } from './LeaderBlocks';
import { EraTooltip } from './SpanTooltip';
import s from './Timeline.module.scss';

const GROUP_H = 22;

type Hover = { laneId: string } & (
  | { placed: PlacedSpan; event?: undefined; era?: undefined }
  | { event: HistEvent; placed?: undefined; era?: undefined }
  | { era: Era; placed?: undefined; event?: undefined }
);

/** Event markers closer than this many px are thinned to the most widely documented one. */
const EVENT_GAP: Record<Level, number> = { 1: 0, 2: 0, 3: 44, 4: 22 };
const EVENT_LABEL_GAP = 30;
const EVENT_LABEL_MIN_LANE_W = 150;

export function Timeline({ region }: { region: RegionData }) {
  const laneFilter = useTimeline((st) => st.laneFilter);
  const level = useTimeline((st) => st.level);
  const setLevel = useTimeline((st) => st.setLevel);
  const cursorYear = useTimeline((st) => st.cursorYear);
  const highlights = useTimeline((st) => st.highlights);
  const zoomCmd = useTimeline((st) => st.zoom);
  const setCursorYear = useTimeline((st) => st.setCursorYear);
  const selectPolity = useTimeline((st) => st.selectPolity);
  const setLaneFilter = useTimeline((st) => st.setLaneFilter);
  const openPanel = useTimeline((st) => st.openPanel);
  const showEvents = useTimeline((st) => st.showEvents);
  const panel = useTimeline((st) => st.panel);

  const lanes = useMemo(() => selectLanes(region.lanes, laneFilter), [region.lanes, laneFilter]);
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(rootRef);

  const narrow = width < 640;
  const axisW = narrow ? 54 : 70;
  const headH = narrow ? 62 : 60;
  const plotW = Math.max(0, width - axisW);
  const plotH = Math.max(0, height - GROUP_H - headH);
  const minLaneW = narrow ? 92 : 108;
  const baseLaneW = lanes.length && lanes.length * minLaneW <= plotW ? Math.min(320, plotW / lanes.length) : minLaneW;
  // Zoomed in, a lane widens to most of the plot on a phone (a strip of each neighbour stays in view
  // to show there are more countries to scroll to) and to a bit over half of it on a wide screen.
  const maxLaneW = Math.max(baseLaneW, narrow ? plotW * 0.82 : Math.min(600, plotW * 0.55));

  const zoom = useTimelineZoom(plotRef, { plotW, plotH, baseLaneW, maxLaneW, nLanes: lanes.length });
  const { k, ty, tx, kx } = zoom.view;
  const laneW = baseLaneW * kx;
  const contentW = laneW * lanes.length;
  const scale = useMemo(() => createTimeScale(plotH, k, ty), [plotH, k, ty]);
  const ticks = useMemo(() => timeTicks(scale, 0, plotH), [scale, plotH]);

  // The level follows the visible time span (like a map's zoom levels).
  const visibleYears = scale.invert(plotH) - scale.invert(0);
  const visibleRef = useRef(visibleYears);
  visibleRef.current = visibleYears;
  // A tap or the level control names the level to land on; the animated zoom on the way must not
  // switch levels, and the landing view keeps that level unless it is clearly past a threshold.
  const lockUntil = useRef(0);
  const settleLevel = useCallback(
    (target: Level, ms = 520) => {
      // The level (and with it the legend's height) changes only once the zoom has landed: a layout
      // change in mid-flight would interrupt the zoom transition.
      lockUntil.current = Date.now() + ms;
      window.setTimeout(() => {
        lockUntil.current = 0;
        const next = levelForSpan(visibleRef.current, target);
        if (next !== useTimeline.getState().level) setLevel(next);
      }, ms + 40);
    },
    [setLevel],
  );
  useEffect(() => {
    if (!plotH || Date.now() < lockUntil.current) return;
    const next = levelForSpan(visibleYears, useTimeline.getState().level);
    if (next !== useTimeline.getState().level) setLevel(next);
  }, [visibleYears, plotH, setLevel]);

  const spansByLane = useMemo(
    () =>
      Object.fromEntries(
        lanes.map((l) => [l.id, filterByDetail(region.spansByLane[l.id] ?? [], level >= 4 ? 'all' : 'major')]),
      ),
    [lanes, region, level],
  );
  const laneIndex = useMemo(() => new Map(lanes.map((l, i) => [l.id, i])), [lanes]);
  const placedEras = useMemo(() => placeEras(region.eras, laneIndex), [region.eras, laneIndex]);
  const eraTone = useMemo(() => {
    const tone = new Map<string, 1 | 2>();
    const byArea = new Map<string, Era[]>();
    for (const e of region.eras) (byArea.get(e.area) ?? byArea.set(e.area, []).get(e.area)!).push(e);
    for (const list of byArea.values())
      [...list].sort((a, b) => a.from - b.from).forEach((e, i) => tone.set(e.id, i % 2 ? 2 : 1));
    return tone;
  }, [region.eras]);
  const eraFor = useCallback(
    (laneId: string) => region.eras.find((e) => e.from <= cursorYear && cursorYear <= e.to && e.lanes.includes(laneId)),
    [region.eras, cursorYear],
  );
  const segments = useMemo(
    () => (level === 2 ? lanes.map((l) => leaderSegments(spansByLane[l.id] ?? [])) : []),
    [level, lanes, spansByLane],
  );
  const placedByLane = useMemo(
    () => Object.fromEntries(Object.entries(spansByLane).map(([id, spans]) => [id, packLane(spans)])),
    [spansByLane],
  );
  const slotOf = useMemo(() => new Map(highlights.map((h) => [h.id, h.slot])), [highlights]);

  // Open on the region's own starting window once the plot has a size (no animation).
  const opened = useRef(false);
  useEffect(() => {
    const { initialYears: years, initialCursor } = regionMeta(region.id);
    if (opened.current || !plotH) return;
    opened.current = true;
    if (!years) return;
    zoom.zoomToYears(years[0], years[1], 0);
    const y = useTimeline.getState().cursorYear;
    if (initialCursor !== undefined && (y < years[0] || y > years[1])) setCursorYear(initialCursor);
  }, [plotH, region.id, zoom, setCursorYear]);

  // Zoom commands from the toolbar, search and side panel.
  const latest = useRef({ lanes, laneW });
  latest.current = { lanes, laneW };
  useEffect(() => {
    if (!zoomCmd) return;
    if (zoomCmd.type === 'years') {
      zoom.zoomToYears(zoomCmd.years[0], zoomCmd.years[1]);
      const i = latest.current.lanes.findIndex((l) => l.id === zoomCmd.laneId);
      if (i >= 0) zoom.panToX(i * latest.current.laneW, latest.current.laneW);
    } else if (zoomCmd.type === 'by') zoom.zoomBy(zoomCmd.factor);
    else if (zoomCmd.type === 'level') {
      const span = LEVEL_TARGET[zoomCmd.level];
      settleLevel(zoomCmd.level);
      if (span === null) zoom.reset();
      else {
        // centred on the year marker, kept inside the chart's years
        const c = useTimeline.getState().cursorYear;
        const a = Math.min(Math.max(TIME_MIN, Math.round(c - span / 2)), TIME_MAX - span);
        zoom.zoomToYears(a, a + span);
      }
    } else zoom.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomCmd?.nonce]);

  // Year marker follows the mouse; a tap sets it on touch screens.
  const frame = useRef(0);
  const setCursorFromY = useCallback(
    (clientY: number) => {
      const rect = plotRef.current?.getBoundingClientRect();
      if (!rect) return;
      const year = yearAt(scale, clientY - rect.top);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setCursorYear(year));
    },
    [scale, setCursorYear],
  );

  // Label wrapping uses the real width of the loaded UI font.
  const [charW, setCharW] = useState(CHAR_W);
  useEffect(() => {
    const measure = () =>
      setCharW(measureCharWidth(getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()));
    measure();
    document.fonts?.ready.then(measure);
  }, []);

  const [hover, setHover] = useState<Hover | null>(null);
  const placeTooltip = useCallback((clientX: number, clientY: number) => {
    const el = tooltipRef.current;
    const root = rootRef.current?.getBoundingClientRect();
    if (!el || !root) return;
    const x = clientX - root.left;
    const y = clientY - root.top;
    const flipX = x + 16 + el.offsetWidth > root.width;
    const flipY = y + 16 + el.offsetHeight > root.height;
    el.style.transform = `translate(${flipX ? x - 12 - el.offsetWidth : x + 16}px, ${flipY ? y - 12 - el.offsetHeight : y + 16}px)`;
  }, []);
  const lastPointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (hover) placeTooltip(lastPointer.current.x, lastPointer.current.y);
  }, [hover, placeTooltip]);

  const onEnter = useCallback((placed: PlacedSpan, e: React.PointerEvent, laneId: string) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({ placed, laneId });
  }, []);
  const onEraEnter = useCallback((era: Era, e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({ era, laneId: era.lanes[0] });
  }, []);
  // Tapping an era or an empire zooms into it, one level deeper; states open their details.
  const zoomInto = useCallback(
    (from: number, to: number, firstLane: number, lastLane: number, target: Level) => {
      setHover(null);
      // Land exactly one level deeper: a long block is entered at its middle, a short one with some
      // context around it (the margin of a zoom shows more years where the axis is compressed, so
      // the windows stay well inside a level).
      const maxSpan = target === 2 ? 1000 : target === 3 ? LEVEL_TARGET[3]! : LEVEL_TARGET[4]!;
      const minSpan = target === 2 ? 420 : target === 3 ? 110 : 0;
      const span = Math.min(maxSpan, Math.max(minSpan, to - from));
      const mid = (from + to) / 2;
      from = Math.round(mid - span / 2);
      to = Math.round(mid + span / 2);
      settleLevel(target);
      zoom.zoomToYears(from, to);
      const { laneW: w } = latest.current;
      zoom.panToX(firstLane * w, (lastLane - firstLane + 1) * w);
      setCursorYear(Math.round((from + to) / 2));
    },
    [zoom, setCursorYear, settleLevel],
  );
  const onEraSelect = useCallback((p: PlacedEra) => zoomInto(p.era.from, p.era.to, p.first, p.last, 2), [zoomInto]);
  const onLeaderEnter = useCallback((span: Span, j: number, e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({
      placed: { span, col: 0, cols: 1 },
      laneId: latest.current.lanes[j]?.id ?? '',
    });
  }, []);
  const onLeaderSelect = useCallback(
    (seg: Segment, j: number) => {
      zoomInto(seg.from, seg.to, j, j, 3);
    },
    [zoomInto],
  );
  const onEventEnter = useCallback((event: HistEvent, e: React.PointerEvent, laneId: string) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({ event, laneId });
  }, []);
  const onEventSelect = useCallback(
    (event: HistEvent) => {
      setHover(null);
      openPanel({ kind: 'event', id: event.id });
    },
    [openPanel],
  );
  const onLeave = useCallback(() => setHover(null), []);
  const onSelect = useCallback(
    (placed: PlacedSpan) => {
      setHover(null);
      selectPolity(placed.span.id);
    },
    [selectPolity],
  );

  const onPeriod = useCallback((p: Period) => useTimeline.getState().zoomTo({ type: 'years', years: p.years }), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = plotH / 8;
    const handled = true;
    switch (e.key) {
      case 'ArrowUp':
        if (e.shiftKey) setCursorYear(yearAt(scale, scale(cursorYear) - 24));
        else zoom.panBy(0, -step);
        break;
      case 'ArrowDown':
        if (e.shiftKey) setCursorYear(yearAt(scale, scale(cursorYear + 1) + 24));
        else zoom.panBy(0, step);
        break;
      case 'ArrowLeft':
        zoom.panBy(-laneW, 0);
        break;
      case 'ArrowRight':
        zoom.panBy(laneW, 0);
        break;
      case '+':
      case '=':
        zoom.zoomBy(1.6);
        break;
      case '-':
        zoom.zoomBy(1 / 1.6);
        break;
      case '0':
        zoom.reset();
        break;
      case 'Enter':
        openPanel({ kind: 'year' });
        break;
      default:
        return;
    }
    if (handled) e.preventDefault();
  };

  const first = Math.max(0, Math.floor(-tx / laneW));
  const last = Math.min(lanes.length - 1, Math.ceil((-tx + plotW) / laneW));
  const yTop = scale.invert(0);
  const yBottom = scale.invert(plotH);
  const hoveredId = hover?.placed?.span.id ?? hover?.era?.id;
  const activeEventId = panel.kind === 'event' ? panel.id : hover?.event?.id;
  const laneById = useMemo(() => new Map(lanes.map((l) => [l.id, l])), [lanes]);
  const cursorY = scale(cursorYear + 0.5);

  return (
    <div ref={rootRef} className={s.root}>
      <div className={s.corner} style={{ width: axisW, height: GROUP_H + headH }} title="Year marker">
        <span className={s.cornerYear}>{cursorYear < 0 ? -cursorYear : cursorYear}</span>
        <span className={s.cornerEra}>{cursorYear < 0 ? 'BCE' : cursorYear < 1000 ? 'CE' : ''}</span>
      </div>

      {lanes.length > 0 && (
        <LaneHeaders
          lanes={lanes}
          spansByLane={spansByLane}
          laneW={laneW}
          tx={tx}
          left={axisW}
          width={plotW}
          groupH={GROUP_H}
          headH={headH}
          cursorYear={cursorYear}
          slotOf={slotOf}
          onSelect={(id) => selectPolity(id)}
          eraFor={level === 1 ? eraFor : undefined}
          onEra={(era, laneId) => {
            const i = laneIndex.get(laneId) ?? 0;
            zoomInto(era.from, era.to, i, i, 2);
          }}
        />
      )}

      <div className={s.axisWrap} style={{ top: GROUP_H + headH, width: axisW, height: plotH }}>
        <TimeAxis
          scale={scale}
          ticks={ticks}
          periods={region.periods}
          width={axisW}
          height={plotH}
          cursorYear={cursorYear}
          onPeriod={onPeriod}
        />
      </div>

      <div
        ref={plotRef}
        className={s.plot}
        style={{
          left: axisW,
          top: GROUP_H + headH,
          width: plotW,
          height: plotH,
        }}
        tabIndex={0}
        role="group"
        aria-roledescription="timeline chart"
        aria-label={`Who held each country's territory. Year marker at ${formatYear(cursorYear)}.`}
        aria-describedby="timeline-keys"
        onKeyDown={onKeyDown}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' && !e.buttons) setCursorFromY(e.clientY);
          if (hover) {
            lastPointer.current = { x: e.clientX, y: e.clientY };
            placeTooltip(e.clientX, e.clientY);
          }
        }}
        onClick={(e) => setCursorFromY(e.clientY)}
      >
        <svg width={plotW} height={plotH} className={s.svg}>
          <defs>
            <pattern id="wht-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: 'var(--hatch)' }} strokeWidth="1.6" />
            </pattern>
          </defs>
          <g transform={`translate(${tx},0)`}>
            <EraBands periods={region.periods} scale={scale} width={contentW} />
          </g>
          <g className={s.grid}>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={plotW} y1={Math.round(scale(t)) + 0.5} y2={Math.round(scale(t)) + 0.5} />
            ))}
          </g>
          <g transform={`translate(${tx},0)`}>
            {lanes.map((lane, i) =>
              i > 0 ? (
                <line
                  key={lane.id}
                  className={lanes[i - 1].group !== lane.group ? s.groupRule : s.laneRule}
                  x1={i * laneW + 0.5}
                  x2={i * laneW + 0.5}
                  y1={0}
                  y2={plotH}
                />
              ) : null,
            )}
            {level === 1 && (
              <EraBlocks
                key="eras"
                placed={placedEras.filter((p) => p.last >= first && p.first <= last)}
                toneOf={eraTone}
                laneW={laneW}
                scale={scale}
                viewH={plotH}
                charW={charW}
                hoveredId={hover?.era?.id}
                onEnter={onEraEnter}
                onLeave={onLeave}
                onSelect={onEraSelect}
              />
            )}
            {level === 2 && (
              <LeaderBlocks
                key="leaders"
                segments={segments}
                first={first}
                last={last}
                laneW={laneW}
                scale={scale}
                viewH={plotH}
                charW={charW}
                slotOf={slotOf}
                hoveredId={hoveredId}
                onEnter={onLeaderEnter}
                onLeave={onLeave}
                onSelect={onLeaderSelect}
              />
            )}
            {level >= 3 &&
              lanes.slice(first, last + 1).map((lane, j) => {
                const laneX = (first + j) * laneW;
                return (
                  <g key={lane.id}>
                    {placedByLane[lane.id]
                      ?.filter((p) => p.span.to + 1 >= yTop && p.span.from <= yBottom)
                      .map((p) => (
                        <SpanBlock
                          key={`${p.span.id}|${p.span.from}`}
                          placed={p}
                          laneX={laneX}
                          laneW={laneW}
                          scale={scale}
                          viewH={plotH}
                          charW={charW}
                          slot={slotOf.get(p.span.id)}
                          ringed={hoveredId === p.span.id}
                          dimmed={false}
                          onEnter={(pl, e) => onEnter(pl, e, lane.id)}
                          onLeave={onLeave}
                          onSelect={onSelect}
                        />
                      ))}
                  </g>
                );
              })}
            {showEvents &&
              level >= 3 &&
              lanes.slice(first, last + 1).map((lane, j) => {
                const events = region.eventsByLane[lane.id];
                if (!events?.length) return null;
                const laneX = (first + j) * laneW;
                return (
                  <EventMarkers
                    key={`ev-${lane.id}`}
                    shown={thinEvents(events, scale, [0, plotH], EVENT_GAP[level], EVENT_LABEL_GAP)}
                    laneX={laneX}
                    laneW={laneW}
                    scale={scale}
                    charW={charW}
                    showLabels={laneW >= EVENT_LABEL_MIN_LANE_W}
                    activeId={activeEventId}
                    onEnter={(ev, e) => onEventEnter(ev, e, lane.id)}
                    onLeave={onLeave}
                    onSelect={onEventSelect}
                  />
                );
              })}
          </g>
          {cursorY >= 0 && cursorY <= plotH && (
            <line className={s.cursor} x1={0} x2={plotW} y1={cursorY} y2={cursorY} />
          )}
        </svg>
      </div>

      {hover?.placed && (
        <SpanTooltip ref={tooltipRef} span={hover.placed.span} laneLabel={laneById.get(hover.laneId)?.label ?? ''} />
      )}
      {hover?.event && <EventTooltip ref={tooltipRef} event={hover.event} />}
      {hover?.era && (
        <EraTooltip ref={tooltipRef} era={hover.era} areaLabel={region.eraAreas[hover.era.area]?.label ?? null} />
      )}

      {lanes.length === 0 && (
        <div className={s.empty}>
          <p>No countries are selected.</p>
          <Button onClick={() => setLaneFilter({ kind: 'all' })}>Show all countries</Button>
        </div>
      )}

      <p id="timeline-keys" className="sr-only">
        Arrow keys scroll through time and across countries. Plus and minus zoom in and out, widening the countries as
        well. Shift with up or down moves the year marker. Enter lists every country at the marked year.
      </p>
    </div>
  );
}
