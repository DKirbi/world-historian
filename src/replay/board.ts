import { cellToBoundary, cellToLatLng, cellsToMultiPolygon, gridDisk } from 'h3-js';
import type { Board } from './types';

/** No state recorded on this land. */
export const NONE = -1;

/** One H3 resolution of the board, decoded once: cell geometry and, for every frame, each cell's owner. */
export interface Grid {
  res: number;
  ids: string[];
  /** Closed hexagon rings, [lng, lat]. */
  rings: [number, number][][];
  centres: [number, number][];
  /** owners[frame * n + cell]: polity index or NONE. */
  owners: Int16Array;
  /** realm[frame * n + cell] = 1 where the owner is the realm of a composite row, not the polity itself. */
  realm: Uint8Array;
  index: Map<string, number>;
}

export function decodeGrid(board: Board, res: number): Grid {
  const changes = board.cells[String(res)];
  const ids = Object.keys(changes);
  const n = ids.length;
  const F = board.frames.length;
  const owners = new Int16Array(F * n).fill(NONE);
  const realm = new Uint8Array(F * n);
  ids.forEach((id, c) => {
    const list = changes[id];
    for (let k = 0; k < list.length; k++) {
      const [from, owner, isRealm] = list[k];
      const to = k + 1 < list.length ? list[k + 1][0] : F;
      for (let f = from; f < to; f++) {
        owners[f * n + c] = owner;
        realm[f * n + c] = isRealm ? 1 : 0;
      }
    }
  });
  const rings = ids.map((id) => cellToBoundary(id, true) as [number, number][]);
  const centres = ids.map((id) => {
    const [lat, lng] = cellToLatLng(id);
    return [lng, lat] as [number, number];
  });
  return { res, ids, rings, centres, owners, realm, index: new Map(ids.map((id, i) => [id, i])) };
}

/** The frame in force in a (fractional) year: the last border change at or before it. */
export function frameAt(frames: number[], year: number): number {
  const y = Math.floor(year);
  let lo = 0;
  let hi = frames.length - 1;
  if (y < frames[0]) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface Territory {
  polity: number;
  cells: number;
  /** Outline rings of every part, [lng, lat]. */
  outlines: [number, number][][];
  /** Where the name goes: the heart of the territory, the owned cell with the most owned cells around it (so a
   *  state with colonies across a sea is named at home, not between them). */
  label: [number, number];
}

/** Territories of one frame: outlines from H3's own cell union, so borders follow the hexagons. */
export function territories(grid: Grid, frame: number): Territory[] {
  const n = grid.ids.length;
  const by = new Map<number, number[]>();
  for (let c = 0; c < n; c++) {
    const o = grid.owners[frame * n + c];
    if (o === NONE) continue;
    let list = by.get(o);
    if (!list) by.set(o, (list = []));
    list.push(c);
  }
  const out: Territory[] = [];
  for (const [polity, cells] of by) {
    const mp = cellsToMultiPolygon(cells.map((c) => grid.ids[c]), true) as [number, number][][][];
    const outlines = mp.flatMap((poly) => poly);
    const own = (c: number) => grid.owners[frame * n + c] === polity;
    let best = cells[0];
    let score = -1;
    for (const c of cells) {
      let k = 0;
      for (const id of gridDisk(grid.ids[c], 2)) {
        const j = grid.index.get(id);
        if (j !== undefined && own(j)) k++;
      }
      if (k > score) {
        score = k;
        best = c;
      }
    }
    out.push({ polity, cells: cells.length, outlines, label: grid.centres[best] });
  }
  return out.sort((a, b) => b.cells - a.cells);
}
