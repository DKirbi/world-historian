import type {
  ErasFile,
  HistEvent,
  Lane,
  PeriodFile,
  PolitiesFile,
  RegionData,
  RegionIndexFile,
  ReviewFile,
  Span,
} from './types';

/**
 * Where region data comes from. The MVP bundles the JSON at build time; a later
 * HTTP source can fetch lane/period files lazily behind the same interface.
 */
export interface RegionSource {
  /** Returns the region immediately when it is already in memory. */
  peek(regionId: string): RegionData | null;
  load(regionId: string): Promise<RegionData>;
}

type FileMap = Record<string, unknown>;

export function assembleRegion(regionId: string, read: (path: string) => unknown): RegionData {
  const base = `${regionId}/`;
  const index = read(`${base}_index.json`) as RegionIndexFile;
  const polityFile = read(`${base}_polities.json`) as PolitiesFile;
  const reviewFile = read(`${base}_review.json`) as ReviewFile | undefined;
  const erasFile = read(`${base}_eras.json`) as ErasFile | undefined;

  const lanes: Lane[] = [...index.lanes].sort((a, b) => a.order - b.order);
  const spansByLane: Record<string, Span[]> = {};
  const appearances: RegionData['appearances'] = {};
  const eventsByLane: Record<string, HistEvent[]> = {};
  const events: RegionData['events'] = {};

  for (const lane of lanes) {
    const seen = new Set<string>();
    const spans: Span[] = [];
    const laneEvents: HistEvent[] = [];
    for (const periodId of lane.periods) {
      const file = read(`${base}${lane.id}/${periodId}.json`) as PeriodFile | undefined;
      if (!file) continue;
      for (const e of file.events ?? []) {
        laneEvents.push(e); // each event sits in the one period file holding its start year
        const entry = (events[e.id] ??= { event: e, laneIds: [] });
        entry.laneIds.push(lane.id);
      }
      for (const s of file.spans) {
        const key = `${s.id}|${s.from}`;
        if (seen.has(key)) continue; // spans crossing a period boundary appear in both files
        seen.add(key);
        spans.push(s);
        (appearances[s.id] ??= []).push({ laneId: lane.id, span: s });
      }
    }
    spansByLane[lane.id] = spans.sort((a, b) => a.from - b.from || (b.peak ?? 0) - (a.peak ?? 0));
    eventsByLane[lane.id] = laneEvents.sort((a, b) => a.year - b.year || b.links - a.links);
  }

  return {
    id: regionId,
    sources: index.sources,
    periods: index.periods,
    periodNote: index.periodNote,
    periodSources: index.periodSources ?? [],
    omittedLanes: index.omittedLanes ?? [],
    lanes,
    spansByLane,
    polities: Object.fromEntries(polityFile.polities.map((p) => [p.id, p])),
    appearances,
    review: Object.fromEntries((reviewFile?.items ?? []).map((r) => [r.id, r])),
    eventsByLane,
    events,
    cited: index.cited,
    eras: erasFile?.eras ?? [],
    eraAreas: Object.fromEntries((erasFile?.areas ?? []).map((a) => [a.id, a])),
  };
}

/** One chunk per region; Vite splits each dynamic import into its own file. */
const BUNDLES: Record<string, () => Promise<{ files: FileMap }>> = {
  europe: () => import('./bundles/europe'),
  americas: () => import('./bundles/americas'),
  oceania: () => import('./bundles/oceania'),
  'africa-middle-east': () => import('./bundles/africa-middle-east'),
  asia: () => import('./bundles/asia'),
};

export function createBundledSource(): RegionSource & {
  prefetch(ids: string[]): void;
} {
  const cache = new Map<string, RegionData>();
  const pending = new Map<string, Promise<RegionData>>();
  const load = (regionId: string): Promise<RegionData> => {
    const hit = cache.get(regionId);
    if (hit) return Promise.resolve(hit);
    const inFlight = pending.get(regionId);
    if (inFlight) return inFlight;
    const bundle = BUNDLES[regionId];
    if (!bundle) return Promise.reject(new Error(`No data for region "${regionId}" yet.`));
    const p = bundle().then(({ files }) => {
      const region = assembleRegion(regionId, (path) => files[`/data/${path}`]);
      cache.set(regionId, region);
      pending.delete(regionId);
      return region;
    });
    pending.set(regionId, p);
    return p;
  };
  return {
    peek: (regionId) => cache.get(regionId) ?? null,
    load,
    /** Warm other regions in the background so switching is instant. */
    prefetch(ids) {
      const idle = (cb: () => void) =>
        typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb) : setTimeout(cb, 300);
      ids.forEach((id) => idle(() => void load(id).catch(() => undefined)));
    },
  };
}

export const regionSource = createBundledSource();
