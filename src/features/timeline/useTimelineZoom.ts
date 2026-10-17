import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import 'd3-transition';
import type { Year } from '@/data/types';
import { baseFraction } from '@/lib/time';
import { prefersReducedMotion } from '@/lib/hooks';

export interface View {
  /** Time zoom factor (1 = whole history fits the plot height). */
  k: number;
  /** Vertical translation of the time axis, px. */
  ty: number;
  /** Horizontal pan across country lanes, px (<= 0). */
  tx: number;
  /** Width factor of the country lanes (1 = the lanes fit side by side, up to the lane limit). */
  kx: number;
}

interface Dims {
  plotW: number;
  plotH: number;
  /** Lane width when not zoomed in, px. */
  baseLaneW: number;
  /** Widest a lane gets when zoomed in, px (a share of the plot, so its neighbours stay in view). */
  maxLaneW: number;
  nLanes: number;
}

/** Time zoom at which the lanes start to widen, and how fast they widen after it. */
export const LANE_ZOOM_FROM = 4;
export const LANE_ZOOM_POWER = 0.7;

/**
 * Width factor of the lanes at time zoom `k`: 1 up to LANE_ZOOM_FROM, then growing more slowly than
 * the time axis, up to the lane limit. Zooming in therefore zooms into the country as well: the
 * stacked blocks of a lane get room to be read and tapped, while the other selected countries stay
 * beside it to scroll across.
 */
export function laneZoom(k: number, baseLaneW: number, maxLaneW: number): number {
  const cap = Math.max(1, maxLaneW / Math.max(1, baseLaneW));
  return Math.min(cap, Math.max(1, (k / LANE_ZOOM_FROM) ** LANE_ZOOM_POWER));
}

/**
 * Horizontal offset after the lane width changes from `wOld` to `wNew` (and the gesture's centre
 * moves from `c0` to `c1`): the point of the lanes that was under `c0` ends up under `c1`.
 */
export function anchoredTx(tx: number, c0: number, c1: number, wOld: number, wNew: number): number {
  return c1 - ((c0 - tx) / wOld) * wNew;
}

/** Horizontal centre of a zoom gesture, px from the left edge of `el`; the middle when it is not a user gesture. */
function gestureX(src: Event | null | undefined, el: HTMLElement, fallback: number): number {
  if (!src) return fallback;
  const left = el.getBoundingClientRect().left;
  const touches = (src as TouchEvent).touches;
  if (touches && touches.length) {
    let sum = 0;
    for (let i = 0; i < touches.length; i++) sum += touches[i].clientX;
    return sum / touches.length - left;
  }
  const x = (src as MouseEvent).clientX;
  return typeof x === 'number' ? x - left : fallback;
}

/** At the deepest zoom a year in the modern segment is roughly 40–60 px tall. */
export const MAX_ZOOM = 200;

/**
 * Pan & zoom for the timeline.
 * - Pinch / Ctrl+wheel zooms time and, past LANE_ZOOM_FROM, the width of the lanes too, around the
 *   fingers or the pointer: the country under them stays under them.
 * - Wheel scrolls time, Shift+wheel or a horizontal trackpad swipe scrolls lanes.
 * - Drag pans both axes.
 * d3-zoom owns the time transform; the lane offset and width are tracked separately (from drag
 * deltas and gesture centres), because the lanes zoom more slowly than time.
 */
export function useTimelineZoom(ref: RefObject<HTMLDivElement>, dims: Dims) {
  const [view, setView] = useState<View>({ k: 1, ty: 0, tx: 0, kx: 1 });
  const dimsRef = useRef(dims);
  dimsRef.current = dims;
  const viewRef = useRef<View>(view);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown>>();
  const lastT = useRef<ZoomTransform>(zoomIdentity);
  const frame = useRef(0);

  /** Where the gesture in progress last was, so a pinch that also moves carries the lanes along. */
  const lastCentre = useRef<number | null>(null);

  const clampTx = useCallback((tx: number, kx = viewRef.current.kx) => {
    const { plotW, baseLaneW, nLanes } = dimsRef.current;
    const contentW = baseLaneW * kx * nLanes;
    return Math.min(0, Math.max(Math.min(0, plotW - contentW), tx));
  }, []);

  const commit = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setView({ ...viewRef.current });
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sel = select(el);
    const z = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .filter((e: Event & { button?: number; ctrlKey?: boolean; metaKey?: boolean }) =>
        e.type === 'wheel' ? Boolean(e.ctrlKey || e.metaKey) : !e.button,
      )
      // Pinch and Ctrl+wheel: about 1.7x per mouse-wheel notch, smooth on trackpads.
      .wheelDelta((e: WheelEvent) => -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * 4)
      .constrain((t) => {
        const H = dimsRef.current.plotH;
        const y = Math.min(0, Math.max(H - t.k * H, t.y));
        return y === t.y ? t : zoomIdentity.translate(t.x, y).scale(t.k);
      })
      .on('start', () => {
        lastCentre.current = null;
      })
      .on('zoom', (e: { transform: ZoomTransform; sourceEvent?: Event | null }) => {
        const t = e.transform;
        const prev = lastT.current;
        const d = dimsRef.current;
        const v = viewRef.current;
        let { tx, kx } = v;
        if (t.k === prev.k) {
          tx = clampTx(tx + (t.x - prev.x));
        } else {
          // time zoomed: the lanes widen more slowly, around the gesture's centre (the middle of the
          // plot for the zoom buttons, taps and the level control)
          kx = laneZoom(t.k, d.baseLaneW, d.maxLaneW);
          const c1 = gestureX(e.sourceEvent, el, d.plotW / 2);
          const c0 = e.sourceEvent && lastCentre.current !== null ? lastCentre.current : c1;
          tx = clampTx(anchoredTx(tx, c0, c1, d.baseLaneW * v.kx, d.baseLaneW * kx), kx);
          lastCentre.current = c1;
        }
        lastT.current = t;
        viewRef.current = { k: t.k, ty: t.y, tx, kx };
        commit();
      });
    sel.call(z).on('dblclick.zoom', null);
    zoomRef.current = z;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // zoom gesture, handled by d3-zoom
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? dimsRef.current.plotH : 1;
      const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
      const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
      if (dx) {
        viewRef.current = {
          ...viewRef.current,
          tx: clampTx(viewRef.current.tx - dx),
        };
        commit();
      }
      if (dy) z.translateBy(sel, 0, -dy / lastT.current.k);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      sel.on('.zoom', null);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [ref, clampTx, commit]);

  // Re-apply limits when the plot is resized or the lane set changes.
  useEffect(() => {
    // Only a height change needs the time transform re-constrained. Doing it on width
    // changes too would interrupt a running zoom transition (e.g. when the side panel opens).
    const el = ref.current;
    const z = zoomRef.current;
    if (el && z && dims.plotH) z.translateBy(select(el), 0, 0);
  }, [ref, dims.plotH]);

  useEffect(() => {
    const kx = laneZoom(viewRef.current.k, dims.baseLaneW, dims.maxLaneW);
    viewRef.current = { ...viewRef.current, kx, tx: clampTx(viewRef.current.tx, kx) };
    commit();
  }, [dims.plotW, dims.baseLaneW, dims.maxLaneW, dims.nLanes, clampTx, commit]);

  const apply = useCallback(
    (t: ZoomTransform, duration: number) => {
      const el = ref.current;
      const z = zoomRef.current;
      if (!el || !z) return;
      const sel = select(el);
      if (duration && !prefersReducedMotion()) sel.transition().duration(duration).call(z.transform, t);
      else sel.call(z.transform, t);
    },
    [ref],
  );

  const zoomToYears = useCallback(
    (from: Year, to: Year, duration = 450) => {
      const H = dimsRef.current.plotH;
      if (!H) return;
      const f0 = baseFraction(from) * H;
      const f1 = baseFraction(to + 1) * H;
      const extent = Math.max(1, f1 - f0);
      const pad = extent * 0.08;
      const k = Math.min(MAX_ZOOM, Math.max(1, H / (extent + 2 * pad)));
      apply(zoomIdentity.translate(lastT.current.x, -(f0 - pad) * k).scale(k), duration);
    },
    [apply],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const el = ref.current;
      const z = zoomRef.current;
      if (!el || !z) return;
      const sel = select(el);
      if (prefersReducedMotion()) z.scaleBy(sel, factor);
      else sel.transition().duration(200).call(z.scaleBy, factor);
    },
    [ref],
  );

  const reset = useCallback(() => apply(zoomIdentity, 450), [apply]);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      if (dx) {
        viewRef.current = {
          ...viewRef.current,
          tx: clampTx(viewRef.current.tx - dx),
        };
        commit();
      }
      const el = ref.current;
      const z = zoomRef.current;
      if (dy && el && z) z.translateBy(select(el), 0, -dy / lastT.current.k);
    },
    [ref, clampTx, commit],
  );

  /** Scroll lanes so the lane starting at `x` (content px) is centred. */
  const panToX = useCallback(
    (x: number, width: number) => {
      viewRef.current = {
        ...viewRef.current,
        tx: clampTx(-(x + width / 2 - dimsRef.current.plotW / 2)),
      };
      commit();
    },
    [clampTx, commit],
  );

  return { view, zoomToYears, zoomBy, reset, panBy, panToX };
}
