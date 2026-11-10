import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { LinearInterpolator, MapView, WebMercatorViewport, type MapViewState } from '@deck.gl/core';
import { PathLayer, PolygonLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { NONE, decodeGrid, territories, type Grid, type Territory } from './board';
import type { Model } from './model';
import type { Locale } from '@/i18n/locales';
import type { ReplayEvent } from './types';

type RGBA = [number, number, number, number];

/** The map keeps the chart's rule: colour only for what the reader follows (Rome), stone greys for the rest. */
const C = {
  sea: [226, 230, 229, 255] as RGBA,
  land: [236, 233, 225, 255] as RGBA,
  coast: [120, 116, 106, 200] as RGBA,
  river: [196, 205, 206, 255] as RGBA,
  grid: [252, 252, 251, 150] as RGBA,
  none: [239, 237, 231, 255] as RGBA,
  noneDot: [160, 155, 143, 200] as RGBA,
  stone: [
    [200, 195, 184, 255],
    [184, 179, 166, 255],
    [214, 210, 198, 255],
    [168, 162, 148, 255],
  ] as RGBA[],
  border: [82, 81, 78, 230] as RGBA,
  rome: [42, 120, 214, 255] as RGBA,
  romeRealm: [42, 120, 214, 120] as RGBA,
  romeBorder: [18, 64, 128, 255] as RGBA,
  romeInk: [16, 58, 118, 255] as RGBA,
  ink: [11, 11, 11, 255] as RGBA,
  page: [252, 252, 251, 255] as RGBA,
};

/** Zoom at which the board switches from resolution-3 hexagons (about 12,400 km²) to resolution 4 (about 1,770 km²). */
const FINE_ZOOM = 4.5;

/** The least zoom at which the board's box still covers the whole view, and the view centred so it stays inside
 *  the box: the map never shows the edge of its own data. */
function limits(bbox: [number, number, number, number], width: number, height: number) {
  const [W, S, E, N] = bbox;
  const my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  // deck.gl's web-mercator world is 512 pixels wide at zoom 0.
  const zw = Math.log2(width / 512 / ((E - W) / 360));
  const zh = Math.log2(height / 512 / ((my(N) - my(S)) / (2 * Math.PI)));
  const minZoom = Math.max(zw, zh);
  const clamp = (v: MapViewState): MapViewState => {
    const z = Math.max(v.zoom, minZoom);
    const scale = 512 * 2 ** z;
    const halfLon = (width / 2 / scale) * 360;
    const lon = Math.min(E - halfLon, Math.max(W + halfLon, v.longitude));
    const halfY = (height / 2 / scale) * 2 * Math.PI;
    const yc = Math.min(my(N) - halfY, Math.max(my(S) + halfY, my(v.latitude)));
    const lat = (Math.atan(Math.exp(yc)) - Math.PI / 4) * (360 / Math.PI);
    return { ...v, zoom: z, longitude: lon, latitude: lat };
  };
  return { minZoom, clamp };
}

export interface CameraTarget {
  key: string;
  longitude: number;
  latitude: number;
  zoom: number;
  /** Frame these bounds [w, s, e, n] instead of the point and zoom. */
  bounds?: [number, number, number, number];
}

interface Props {
  model: Model;
  lang: Locale;
  frame: number;
  year: number;
  current: ReplayEvent | null;
  target: CameraTarget | null;
  follow: boolean;
  reducedMotion: boolean;
  onUserMove: () => void;
  onPick: (eventIndex: number) => void;
}

export function Board({ model, lang, frame, year, current, target, follow, reducedMotion, onUserMove, onPick }: Props) {
  const board = model.pack.board;
  const grids = useMemo(() => Object.fromEntries(board.res.map((r) => [r, decodeGrid(board, r)])) as Record<number, Grid>, [board]);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<MapViewState | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lim = useMemo(
    () => (size.width ? limits(model.pack.bbox, size.width, size.height) : null),
    [model.pack.bbox, size.width, size.height],
  );

  // First view: the whole stage.
  useEffect(() => {
    if (view || !lim) return;
    const [W, S, E, N] = model.pack.bbox;
    setView(lim.clamp({ longitude: (W + E) / 2, latitude: (S + N) / 2, zoom: lim.minZoom, pitch: 0, bearing: 0 }));
  }, [lim, view, model.pack.bbox]);

  // The director: fly to each target while following.
  useEffect(() => {
    if (!target || !follow || !view || !lim) return;
    let goal = { longitude: target.longitude, latitude: target.latitude, zoom: target.zoom };
    if (target.bounds) {
      const [w, s, e, n] = target.bounds;
      const pad = Math.min(80, size.width / 8);
      const vp = new WebMercatorViewport({ width: size.width, height: size.height }).fitBounds(
        [
          [w - 1, s - 1],
          [e + 1, n + 1],
        ],
        { padding: { top: pad, bottom: pad, left: Math.min(pad + 300, size.width / 3), right: pad } },
      );
      // A theatre is framed, but never much closer than the whole board: one war's events can sit in one place.
      goal = { longitude: vp.longitude, latitude: vp.latitude, zoom: Math.min(lim.minZoom + 0.9, vp.zoom) };
    }
    // On a phone the card covers the lower half of the board: put the event in the upper part instead.
    if (!target.bounds && size.width <= 760) {
      const vp = new WebMercatorViewport({ ...goal, width: size.width, height: size.height });
      const [lon, lat] = vp.unproject([size.width / 2, size.height / 2 + size.height * 0.24]);
      goal = { ...goal, longitude: lon, latitude: lat };
    }
    goal = lim.clamp({ ...goal, pitch: 0, bearing: 0 });
    const dist = Math.hypot(goal.longitude - view.longitude, goal.latitude - view.latitude);
    setView({
      ...goal,
      pitch: 0,
      bearing: 0,
      transitionDuration: reducedMotion ? 0 : dist > 12 ? 2200 : 1400,
      // A straight pan and zoom, not a fly-to arc: the arc would pull back past the board's edge.
      transitionInterpolator: new LinearInterpolator(['longitude', 'latitude', 'zoom']),
    } as MapViewState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key, follow]);

  const landPolygons = useMemo(
    () => (board.land.type === 'MultiPolygon' ? board.land.coordinates : board.land.type === 'Polygon' ? [board.land.coordinates] : []),
    [board.land],
  );
  const res = (view?.zoom ?? 3) >= FINE_ZOOM ? board.res[board.res.length - 1] : board.res[0];
  const grid = grids[res];
  const n = grid.ids.length;
  const terr = useMemo(() => territories(grid, frame), [grid, frame]);
  const cellIx = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);
  const noneIx = useMemo(() => cellIx.filter((c) => grid.owners[frame * n + c] === NONE), [cellIx, grid, frame, n]);

  const fill = (c: number): RGBA => {
    const o = grid.owners[frame * n + c];
    if (o === NONE) return C.none;
    const p = board.polities[o];
    const realm = grid.realm[frame * n + c] === 1;
    if (p.rome) return realm ? C.romeRealm : C.rome;
    const s = C.stone[o % C.stone.length];
    return realm ? [s[0], s[1], s[2], 150] : s;
  };

  const name = (t: Territory) => {
    const p = board.polities[t.polity];
    return (lang === 'sl' && p.sl) || p.name;
  };
  const scale = res === board.res[0] ? 1 : 7;
  const labelSize = (t: Territory) => Math.max(10, Math.min(19, 9 + Math.sqrt(t.cells / scale) * 0.9));
  // Names: the largest territories first, Rome before all; a name that would overlap one already placed is left
  // out, as a printed map would. Placement follows the view, recomputed when it moves by a visible amount.
  const vkey = view ? `${Math.round(view.zoom * 4)}:${Math.round(view.longitude * 2)}:${Math.round(view.latitude * 2)}` : '';
  const labelled = useMemo(() => {
    if (!view || !size.width) return [];
    const vp = new WebMercatorViewport({ ...view, width: size.width, height: size.height });
    const min = res === board.res[0] ? 2 : 8;
    const cand = terr
      .filter((t) => t.cells >= min)
      .sort((a, b) => Number(board.polities[b.polity].rome) - Number(board.polities[a.polity].rome) || b.cells - a.cells);
    const boxes: [number, number, number, number][] = [];
    const out: Territory[] = [];
    for (const t of cand) {
      const [x, y] = vp.project(t.label);
      const size_ = labelSize(t);
      const w = name(t).length * size_ * 0.62 + 8;
      const h = size_ * 1.3;
      const b: [number, number, number, number] = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      boxes.push(b);
      out.push(t);
      if (out.length >= 30) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terr, vkey, size.width, size.height, lang, res]);
  const labelLayer = (id: string, data: Territory[]) =>
    new TextLayer<Territory>({
      id: `${id}-${res}-${fontsReady ? 'f' : 'x'}`,
      data,
      getPosition: (t) => t.label,
      getText: (t) => name(t).toUpperCase(),
      getSize: labelSize,
      getColor: (t) => (board.polities[t.polity].rome ? C.romeInk : C.ink),
      fontFamily: '"IBM Plex Sans Condensed", "Arial Narrow", sans-serif',
      fontWeight: 600,
      characterSet: 'auto',
      fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
      outlineWidth: 3,
      outlineColor: C.page,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      updateTriggers: { getText: [lang] },
    });

  const decade = Math.floor(year * 4);
  const recent = useMemo(
    () => model.visible.map((i) => model.events[i]).filter((e) => e.coord && e.t <= year + 1e-6 && year - e.t < 40 && e !== current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, decade, current],
  );

  const layers = [
    new SolidPolygonLayer({
      id: 'land',
      data: landPolygons,
      getPolygon: (p: number[][][]) => p as never,
      getFillColor: C.land,
    }),
    new PolygonLayer<number>({
      id: `cells-${res}`,
      data: cellIx,
      getPolygon: (c) => grid.rings[c],
      getFillColor: fill,
      stroked: true,
      getLineColor: C.grid,
      lineWidthUnits: 'pixels',
      getLineWidth: res === board.res[0] ? 0.8 : 0.4,
      updateTriggers: { getFillColor: [frame, res] },
      pickable: false,
    }),
    new ScatterplotLayer<number>({
      id: `none-${res}`,
      data: noneIx,
      getPosition: (c) => grid.centres[c],
      getRadius: 1.1,
      radiusUnits: 'pixels',
      getFillColor: C.noneDot,
    }),
    ...(board.rivers
      ? [
          new PathLayer({
            id: 'rivers',
            data: board.rivers.flatMap((g) => (g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [])),
            getPath: (p: number[][]) => p as never,
            getColor: C.river,
            widthUnits: 'pixels',
            getWidth: 0.8,
          }),
        ]
      : []),
    new PathLayer({
      id: 'coast',
      data: landPolygons.flat(),
      getPath: (ring: number[][]) => ring as never,
      getColor: C.coast,
      widthUnits: 'pixels',
      getWidth: 0.7,
    }),
    new PathLayer<{ path: [number, number][]; rome: boolean }>({
      id: `borders-${res}`,
      data: terr.flatMap((t) => t.outlines.map((path) => ({ path, rome: board.polities[t.polity].rome }))),
      getPath: (d) => d.path,
      getColor: (d) => (d.rome ? C.romeBorder : C.border),
      widthUnits: 'pixels',
      getWidth: (d) => (d.rome ? 2 : 1.2),
      jointRounded: true,
      updateTriggers: { getPath: [frame, res] },
    }),
    labelLayer('labels', labelled),
    new ScatterplotLayer<ReplayEvent>({
      id: 'recent',
      data: recent,
      getPosition: (e) => e.coord!,
      getRadius: 4,
      radiusUnits: 'pixels',
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      getLineColor: C.page,
      getFillColor: (e) => [11, 11, 11, Math.round(255 * Math.max(0.25, 1 - (year - e.t) / 40))],
      pickable: true,
      updateTriggers: { getFillColor: [decade] },
    }),
  ];

  const vp = view && size.width ? new WebMercatorViewport({ ...view, width: size.width, height: size.height }) : null;
  const at = current?.coord && vp ? vp.project(current.coord) : null;

  return (
    <div className="rp-board" ref={wrap} data-zoom={view?.zoom.toFixed(2)} data-res={res}>
      {view && size.width > 0 && (
        <DeckGL
          views={new MapView({ repeat: false })}
          viewState={view}
          controller={{ dragRotate: false, touchRotate: false, keyboard: false, inertia: true }}
          onViewStateChange={({ viewState, interactionState }) => {
            const v = viewState as MapViewState;
            setView(lim ? { ...lim.clamp(v), maxZoom: 7.2 } : v);
            if (interactionState.isDragging || interactionState.isPanning || interactionState.isZooming) onUserMove();
          }}
          layers={layers}
          style={{ background: `rgb(${C.sea.slice(0, 3).join(',')})` } as never}
          getCursor={({ isHovering, isDragging }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
          onClick={(info) => {
            const e = info.object as ReplayEvent | undefined;
            if (e) onPick(model.events.indexOf(e));
          }}
        />
      )}
      {at && current && (
        <div className="rp-now" style={{ transform: `translate(${at[0]}px, ${at[1]}px)` }} aria-hidden="true">
          <span className="rp-now__ring" />
          <span className="rp-now__dot" />
          <span className="rp-now__label">{(lang === 'sl' && current.sl) || current.label}</span>
        </div>
      )}
    </div>
  );
}
