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
import { capColumns, maxColumns, packLane, type PlacedSpan, type StackBlock } from '@/lib/pack';
import { filterByDetail } from '@/lib/spans';
import { thinEvents } from '@/lib/events';
import { useElementSize, useMediaQuery } from '@/lib/hooks';
import { CHAR_W, measureCharWidth } from '@/lib/labels';
import { DRAWER_MIN, followedPolity, selectLanes, useTimeline } from '@/state/store';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/Button';
import { regionMeta } from '@/data/regions';
import { areaName, eraName } from '@/features/story/templates';
import { CHART_MIN } from '@/features/story/Drawer';
import { PHONE_QUERY } from '@/features/story/DrawerHost';
import { useTimelineZoom } from './useTimelineZoom';
import { TimeAxis } from './TimeAxis';
import { EraBands } from './EraBands';
import { LaneHeaders } from './LaneHeaders';
import { SpanBlock } from './SpanBlock';
import { EraTooltip, EventTooltip, SpanTooltip, StackTooltip } from './SpanTooltip';
import { EventMarkers } from './EventMarkers';
import { EraBlocks } from './EraBlocks';
import { LeaderBlocks } from './LeaderBlocks';
import { StackBlocks, stackKey } from './StackBlocks';
import s from './Timeline.module.scss';

const GROUP_H = 22;

type Hover = { laneId: string } & (
  | { placed: PlacedSpan; event?: undefined; era?: undefined; stack?: undefined }
  | { event: HistEvent; placed?: undefined; era?: undefined; stack?: undefined }
  | { era: Era; placed?: undefined; event?: undefined; stack?: undefined }
  | { stack: StackBlock; placed?: undefined; event?: undefined; era?: undefined }
);

/** Event markers closer than this many px are thinned to the most widely documented one. */
const EVENT_GAP: Record<Level, number> = { 1: 0, 2: 0, 3: 44, 4: 22 };
const EVENT_LABEL_GAP = 30;
const EVENT_LABEL_MIN_LANE_W = 150;

export function Timeline({ region }: { region: RegionData }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const laneFilter = useTimeline((st) => st.laneFilter);
  const level = useTimeline((st) => st.level);
  const setLevel = useTimeline((st) => st.setLevel);
  const cursorYear = useTimeline((st) => st.cursorYear);
  const zoomCmd = useTimeline((st) => st.zoom);
  const setCursorYear = useTimeline((st) => st.setCursorYear);
  const setLaneFilter = useTimeline((st) => st.setLaneFilter);
  const openPanel = useTimeline((st) => st.openPanel);
  const openStory = useTimeline((st) => st.openStory);
  const closeStory = useTimeline((st) => st.closeStory);
  const showEvents = useTimeline((st) => st.showEvents);
  const story = useTimeline((st) => st.story);
  const storyNonce = useTimeline((st) => st.storyNonce);
  const panelOpen = useTimeline((st) => st.panel.kind !== 'none');
  const drawer = useTimeline((st) => st.drawer);
  const phone = useMediaQuery(PHONE_QUERY);

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

  // The drawer covers the right of the chart without resizing it; the columns scroll out from under it.
  const drawerOpen = !phone && (Boolean(story) || panelOpen);
  const fullDrawer = drawerOpen && Boolean(story) && drawer.full;
  const occludeRight = !drawerOpen || fullDrawer ? 0 : Math.min(Math.max(DRAWER_MIN, drawer.width), Math.max(DRAWER_MIN, width - CHART_MIN));
  const viewW = Math.max(laneMinView(baseLaneW), plotW - occludeRight);

  const zoom = useTimelineZoom(plotRef, { plotW, plotH, baseLaneW, maxLaneW, nLanes: lanes.length, occludeRight });
  const { k, ty, tx, kx } = zoom.view;
  const laneW = baseLaneW * kx;
  const contentW = laneW * lanes.length;
  const scale = useMemo(() => createTimeScale(plotH, k, ty), [plotH, k, ty]);
  const ticks = useMemo(() => timeTicks(scale, 0, plotH), [scale, plotH]);

  // The level follows the visible time span (like a map's zoom levels).
  const visibleYears = scale.invert(plotH) - scale.invert(0);
  const visibleRef = useRef(visibleYears);
  visibleRef.current = visibleYears;
  // The level control and a double-click name the level to land on; the animated zoom on the way must
  // not switch levels, and the landing view keeps that level unless it is clearly past a threshold.
  const lockUntil = useRef(0);
  const settleLevel = useCallback(
    (target: Level, ms = 520) => {
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
  const packedByLane = useMemo(
    () => Object.fromEntries(Object.entries(spansByLane).map(([id, spans]) => [id, packLane(spans)])),
    [spansByLane],
  );
  // Side-by-side columns are capped so every block stays a usable target; the rest gather into "+N".
  const maxCols = maxColumns(laneW);
  const placedByLane = useMemo(
    () => Object.fromEntries(Object.entries(packedByLane).map(([id, placed]) => [id, capColumns(placed, maxCols)])),
    [packedByLane, maxCols],
  );

  // ---- the open story: the state it follows, and the column it is told from ----
  const selectedId = followedPolity(story);
  const focusLaneId = useMemo(() => {
    if (!story) return undefined;
    if (story.lane && laneIndex.has(story.lane)) return story.lane;
    if (story.kind === 'polity') return (region.appearances[story.id] ?? []).map((a) => a.laneId).find((id) => laneIndex.has(id));
    if (story.kind === 'event') return region.events[story.id]?.laneIds.find((id) => laneIndex.has(id));
    if (story.kind === 'era') return region.eras.find((e) => e.id === story.id)?.lanes.find((id) => laneIndex.has(id));
    return undefined;
  }, [story, laneIndex, region]);
  const focusIndex = focusLaneId ? laneIndex.get(focusLaneId) : undefined;
  // Other countries fade back while the story is read beside the chart (not at full width, not on phones).
  const dimming = Boolean(story) && drawerOpen && !fullDrawer && focusIndex !== undefined;
  const laneDimmed = useCallback((i: number) => dimming && i !== focusIndex, [dimming, focusIndex]);

  // Keep the story's column in view beside the drawer: when a story opens, and when the drawer resizes.
  // A story opened from search or a link also zooms; the column is checked again until that zoom has
  // landed (the lanes widen while it runs), then the reader is free to pan away.
  const latest = useRef({ lanes, laneW, tx, viewW });
  latest.current = { lanes, laneW, tx, viewW };
  const focusUntil = useRef(0);
  useEffect(() => {
    focusUntil.current = Date.now() + 900;
  }, [storyNonce, occludeRight, drawerOpen, fullDrawer]);
  useEffect(() => {
    if (focusIndex === undefined || !drawerOpen || fullDrawer || Date.now() > focusUntil.current) return;
    const left = tx + focusIndex * laneW;
    if (left >= 0 && left + Math.min(laneW, viewW) <= viewW + 0.5) return; // already in the uncovered part
    zoom.panToX(focusIndex * laneW, laneW, viewW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyNonce, focusIndex, occludeRight, drawerOpen, fullDrawer, laneW, tx, viewW]);

  // Open on the region's own starting window, or on a shared story's years, once the plot has a size
  // (no animation). The plot's height settles a moment later (the legend under it takes its final size),
  // and the time transform is in px, so the window is applied again while the layout settles.
  const initialWindow = useRef<{ years: [number, number]; until: number } | null>(null);
  useEffect(() => {
    if (!plotH) return;
    if (!initialWindow.current) {
      const { initialYears: years, initialCursor } = regionMeta(region.id);
      const st = useTimeline.getState().story;
      const fromLink = st ? storyYears(st, region) : null;
      const target = fromLink ?? years;
      initialWindow.current = { years: target ?? [TIME_MIN, TIME_MAX], until: target ? Date.now() + 1500 : 0 };
      if (!target) return;
      const y = useTimeline.getState().cursorYear;
      if (fromLink) setCursorYear(Math.round((fromLink[0] + fromLink[1]) / 2));
      else if (initialCursor !== undefined && (y < target[0] || y > target[1])) setCursorYear(initialCursor);
    }
    const w = initialWindow.current;
    if (Date.now() <= w.until) zoom.zoomToYears(w.years[0], w.years[1], 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotH, region]);

  // Zoom commands from the toolbar, search and the story drawer.
  useEffect(() => {
    if (!zoomCmd) return;
    if (initialWindow.current) initialWindow.current.until = 0; // the reader has taken over
    if (zoomCmd.type === 'years') {
      zoom.zoomToYears(zoomCmd.years[0], zoomCmd.years[1]);
      const i = latest.current.lanes.findIndex((l) => l.id === zoomCmd.laneId);
      if (i >= 0) zoom.panToX(i * latest.current.laneW, latest.current.laneW, latest.current.viewW);
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

  /** The lane under a pointer x (client px), for blocks that span several lanes. */
  const laneAtClientX = useCallback((clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    const { laneW: w, tx: x } = latest.current;
    if (!rect) return 0;
    return Math.floor((clientX - rect.left - x) / w);
  }, []);

  const onEnter = useCallback((placed: PlacedSpan, e: React.PointerEvent, laneId: string) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({ placed, laneId });
  }, []);
  const onEraEnter = useCallback((era: Era, e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({ era, laneId: era.lanes[0] });
  }, []);
  // Double-click on an era or an empire zooms into it, one level deeper; a click opens its story.
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
      const { laneW: w, viewW: vw } = latest.current;
      zoom.panToX(firstLane * w, (lastLane - firstLane + 1) * w, vw);
      setCursorYear(Math.round((from + to) / 2));
    },
    [zoom, setCursorYear, settleLevel],
  );
  const onEraSelect = useCallback(
    (p: PlacedEra, e: React.MouseEvent) => {
      setHover(null);
      const i = Math.min(p.last, Math.max(p.first, laneAtClientX(e.clientX)));
      openStory({ kind: 'era', id: p.era.id, lane: latest.current.lanes[i]?.id });
    },
    [openStory, laneAtClientX],
  );
  const onEraZoom = useCallback((p: PlacedEra) => zoomInto(p.era.from, p.era.to, p.first, p.last, 2), [zoomInto]);
  const onLeaderEnter = useCallback((span: Span, j: number, e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({ placed: { span, col: 0, cols: 1 }, laneId: latest.current.lanes[j]?.id ?? '' });
  }, []);
  const onLeaderSelect = useCallback(
    (seg: Segment, j: number) => {
      setHover(null);
      openStory({ kind: 'polity', id: seg.span.id, lane: latest.current.lanes[j]?.id });
    },
    [openStory],
  );
  const onLeaderZoom = useCallback((seg: Segment, j: number) => zoomInto(seg.from, seg.to, j, j, 3), [zoomInto]);
  const onEventEnter = useCallback((event: HistEvent, e: React.PointerEvent, laneId: string) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({ event, laneId });
  }, []);
  const onEventSelect = useCallback(
    (event: HistEvent, laneId: string) => {
      setHover(null);
      openStory({ kind: 'event', id: event.id, lane: laneId });
    },
    [openStory],
  );
  const onStackEnter = useCallback((stack: StackBlock, e: React.PointerEvent, laneId: string) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setHover({ stack, laneId });
  }, []);
  const onStackSelect = useCallback(
    (b: StackBlock, laneId: string) => {
      setHover(null);
      openStory({ kind: 'stack', lane: laneId, from: b.from, to: b.to });
    },
    [openStory],
  );
  const onLeave = useCallback(() => setHover(null), []);
  const onSelect = useCallback(
    (placed: PlacedSpan, laneId: string) => {
      setHover(null);
      openStory({ kind: 'polity', id: placed.span.id, lane: laneId });
    },
    [openStory],
  );

  const onPeriod = useCallback((p: Period) => useTimeline.getState().zoomTo({ type: 'years', years: p.years }), []);
  const periodName = useCallback((p: Period) => i18n.tx(`period.${region.id}.${p.id}`, p.label), [i18n, region.id]);
  const nameOfEra = useCallback((era: Era) => eraName(era, region, i18n), [region, i18n]);
  const nameOfSpan = useCallback((sp: Span) => i18n.polity(sp), [i18n]);
  const stackLabel = useCallback(
    (n: number, long: boolean) => t(long ? 'timeline.stackLabelLong' : 'timeline.stackLabel', { n }),
    [t],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = plotH / 8;
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
      case 'Escape':
        if (!story) return;
        closeStory();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const first = Math.max(0, Math.floor(-tx / laneW));
  const last = Math.min(lanes.length - 1, Math.ceil((-tx + plotW) / laneW));
  const yTop = scale.invert(0);
  const yBottom = scale.invert(plotH);
  const hoveredId = hover?.placed?.span.id ?? hover?.era?.id;
  const activeEventId = story?.kind === 'event' ? story.id : hover?.event?.id;
  const laneById = useMemo(() => new Map(lanes.map((l) => [l.id, l])), [lanes]);
  const laneLabel = (id: string) => {
    const l = laneById.get(id);
    return l ? i18n.lane(l) : '';
  };
  const cursorY = scale(cursorYear + 0.5);
  const eraOfStory = story?.kind === 'era' ? story.id : undefined;
  const activeStack = story?.kind === 'stack' ? { lane: story.lane, key: stackKey(story) } : null;

  return (
    <div ref={rootRef} className={s.root}>
      <div className={s.corner} style={{ width: axisW, height: GROUP_H + headH }} title={t('timeline.yearMarker')}>
        <span className={s.cornerYear}>{cursorYear < 0 ? -cursorYear : cursorYear}</span>
        <span className={s.cornerEra}>{fmt.eraSuffix(cursorYear)}</span>
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
          selectedId={selectedId}
          focusLaneId={story ? focusLaneId : undefined}
          eraName={nameOfEra}
          onSelect={(id, laneId) => openStory({ kind: 'polity', id, lane: laneId })}
          eraFor={level === 1 ? eraFor : undefined}
          onEra={(era, laneId) => openStory({ kind: 'era', id: era.id, lane: laneId })}
        />
      )}

      <div className={s.axisWrap} style={{ top: GROUP_H + headH, width: axisW, height: plotH }}>
        <TimeAxis
          scale={scale}
          ticks={ticks}
          periods={region.periods}
          periodName={periodName}
          width={axisW}
          height={plotH}
          cursorYear={cursorYear}
          onPeriod={onPeriod}
        />
      </div>

      <div
        ref={plotRef}
        className={s.plot}
        style={{ left: axisW, top: GROUP_H + headH, width: plotW, height: plotH }}
        tabIndex={0}
        role="group"
        aria-roledescription={t('timeline.roledesc')}
        aria-label={t('timeline.aria', { year: fmt.year(cursorYear) })}
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
            {ticks.map((tk) => (
              <line key={tk} x1={0} x2={plotW} y1={Math.round(scale(tk)) + 0.5} y2={Math.round(scale(tk)) + 0.5} />
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
                nameOf={nameOfEra}
                leaderName={(l) => i18n.polity(l)}
                selectedId={eraOfStory}
                isDimmed={(p) => dimming && p.era.id !== eraOfStory && (focusIndex! < p.first || focusIndex! > p.last)}
                hoveredId={hover?.era?.id}
                onEnter={onEraEnter}
                onLeave={onLeave}
                onSelect={onEraSelect}
                onZoom={onEraZoom}
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
                nameOf={nameOfSpan}
                selectedId={selectedId}
                isDimmed={(j, sp) => laneDimmed(j) && sp.id !== selectedId}
                hoveredId={hoveredId}
                onEnter={onLeaderEnter}
                onLeave={onLeave}
                onSelect={onLeaderSelect}
                onZoom={onLeaderZoom}
              />
            )}
            {level >= 3 &&
              lanes.slice(first, last + 1).map((lane, j) => {
                const laneX = (first + j) * laneW;
                const dim = laneDimmed(first + j);
                const { placed, stacks } = placedByLane[lane.id] ?? { placed: [], stacks: [] };
                return (
                  <g key={lane.id}>
                    {placed
                      .filter((p) => p.span.to + 1 >= yTop && p.span.from <= yBottom)
                      .map((p) => (
                        <SpanBlock
                          key={`${p.span.id}|${p.span.from}`}
                          placed={p}
                          laneX={laneX}
                          laneW={laneW}
                          scale={scale}
                          viewH={plotH}
                          charW={charW}
                          name={nameOfSpan(p.span)}
                          selected={selectedId === p.span.id}
                          ringed={hoveredId === p.span.id}
                          dimmed={dim && p.span.id !== selectedId}
                          onEnter={(pl, e) => onEnter(pl, e, lane.id)}
                          onLeave={onLeave}
                          onSelect={(pl) => onSelect(pl, lane.id)}
                        />
                      ))}
                    {stacks.length > 0 && (
                      <StackBlocks
                        stacks={stacks.filter((b) => b.to + 1 >= yTop && b.from <= yBottom)}
                        laneX={laneX}
                        laneW={laneW}
                        scale={scale}
                        viewH={plotH}
                        label={stackLabel}
                        activeKey={activeStack?.lane === lane.id ? activeStack.key : undefined}
                        dimmed={dim}
                        onEnter={(b, e) => onStackEnter(b, e, lane.id)}
                        onLeave={onLeave}
                        onSelect={(b) => onStackSelect(b, lane.id)}
                      />
                    )}
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
                    nameOf={i18n.event}
                    showLabels={laneW >= EVENT_LABEL_MIN_LANE_W}
                    activeId={activeEventId}
                    dimmed={laneDimmed(first + j)}
                    onEnter={(ev, e) => onEventEnter(ev, e, lane.id)}
                    onLeave={onLeave}
                    onSelect={(ev) => onEventSelect(ev, lane.id)}
                  />
                );
              })}
            {story && focusIndex !== undefined && focusIndex >= first && focusIndex <= last && (
              <g aria-hidden="true">
                <line className={s.focusRule} x1={focusIndex * laneW + 0.75} x2={focusIndex * laneW + 0.75} y1={0} y2={plotH} />
                <line className={s.focusRule} x1={(focusIndex + 1) * laneW - 0.75} x2={(focusIndex + 1) * laneW - 0.75} y1={0} y2={plotH} />
              </g>
            )}
          </g>
          {cursorY >= 0 && cursorY <= plotH && <line className={s.cursor} x1={0} x2={plotW} y1={cursorY} y2={cursorY} />}
        </svg>
      </div>

      {hover?.placed && <SpanTooltip ref={tooltipRef} span={hover.placed.span} laneLabel={laneLabel(hover.laneId)} />}
      {hover?.event && <EventTooltip ref={tooltipRef} event={hover.event} />}
      {hover?.era && <EraTooltip ref={tooltipRef} era={hover.era} name={nameOfEra(hover.era)} areaLabel={areaName(hover.era, region, i18n)} />}
      {hover?.stack && <StackTooltip ref={tooltipRef} block={hover.stack} laneLabel={laneLabel(hover.laneId)} />}

      {lanes.length === 0 && (
        <div className={s.empty}>
          <p>{t('timeline.empty')}</p>
          <Button onClick={() => setLaneFilter({ kind: 'all' })}>{t('timeline.showAll')}</Button>
        </div>
      )}

      <p id="timeline-keys" className="sr-only">
        {t('timeline.keys')}
      </p>
    </div>
  );
}

/** The narrowest uncovered view kept beside a drawer: one lane, at least. */
const laneMinView = (laneW: number) => Math.max(laneW, CHART_MIN);

/** Years a story is about, to open a shared link on them. */
function storyYears(story: NonNullable<ReturnType<typeof useTimeline.getState>['story']>, region: RegionData): [number, number] | null {
  if (story.kind === 'stack') return [story.from, story.to];
  if (story.kind === 'era') {
    const e = region.eras.find((x) => x.id === story.id);
    return e ? [e.from, e.to] : null;
  }
  if (story.kind === 'event') {
    const e = region.events[story.id]?.event;
    if (!e) return null;
    const pad = Math.max(10, Math.round(((e.to ?? e.year) - e.year) * 0.3));
    return [e.year - pad, (e.to ?? e.year) + pad];
  }
  const apps = (region.appearances[story.id] ?? []).filter((a) => !story.lane || a.laneId === story.lane);
  if (!apps.length) return null;
  return [Math.min(...apps.map((a) => a.span.from)), Math.max(...apps.map((a) => a.span.to))];
}
