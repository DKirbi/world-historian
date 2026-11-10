/** The replay pack written by data/tools/build_replay.py (data/replay/<id>.json). */

/** As recorded on Wikidata: [year, month, day, precision, calendar]. Negative years are BCE; precision 11 = day,
 *  10 = month, 9 = year. Month and day are 0 when unknown. */
export type WdDate = [number, number, number, number, string];

export interface StoryEn {
  title: string;
  url: string;
  rev: number;
  description?: string;
  paragraphs: string[];
  retrieved: string;
}

export interface StorySl {
  title?: string;
  paragraphs: string[];
  method?: string;
  reviewed?: unknown;
  sourceRev?: number;
  sourceRetrieved?: string;
}

export interface Participant {
  id: string;
  label: string | null;
  rome: boolean;
}

export interface Editorial {
  why: string;
  quote: string;
  basis?: string;
}

export interface ReplayEvent {
  id: string;
  label: string;
  sl?: string | null;
  class: string;
  date: WdDate;
  end: WdDate | null;
  /** Position on the time axis: year plus the share of the year elapsed (mid-year when only the year is known). */
  t: number;
  coord: [number, number] | null;
  placedBy: 'coordinates' | 'location' | null;
  sitelinks: number;
  war: string | null;
  wars: string[];
  wiki?: string | null;
  description?: string | null;
  participants: Participant[];
  story: StoryEn | null;
  storySl: StorySl | null;
  lanes: string[];
  /** The day the stored Wikipedia introduction gives, where it differs from Wikidata's. */
  textDate?: WdDate;
  /** Every chart column that shows the event (empty for an event at sea). */
  countries: { lane: string; label: string; sl?: string | null }[];
  editorial?: Editorial;
}

export interface ReplayWar {
  id: string;
  label: string;
  sl?: string | null;
  class: string;
  start: WdDate;
  end: WdDate;
  parent: string | null;
  partOf: string[];
  umbrella: boolean;
  sitelinks: number;
  wiki?: string | null;
  description?: string | null;
  participants: Participant[];
  story: StoryEn | null;
  storySl: StorySl | null;
  editorial?: Editorial;
}

export interface BoardPolity {
  name: string;
  chartId: string | null;
  sl: string | null;
  rome: boolean;
  wikipedia: string | null;
}

/** [frame index, polity index] or [frame index, polity index, 1] for a realm (a composite "(X)" row), or
 *  [frame index, -1] for land with no state recorded. */
export type CellChange = [number, number] | [number, number, 1];

export interface Board {
  frames: number[];
  res: number[];
  cells: Record<string, Record<string, CellChange[]>>;
  polities: BoardPolity[];
  land: GeoJSON.Geometry;
  rivers?: GeoJSON.Geometry[];
}

export interface MinimapSpan {
  id: string;
  name: string;
  from: number;
  to: number;
  tier: 1 | 2 | 3;
  peak?: number;
  realm?: boolean;
  extent?: string;
}

export interface MinimapLane {
  lane: string;
  label: string;
  sl?: string | null;
  region: string;
  spans: MinimapSpan[];
  events: string[];
}

export interface Source {
  name: string;
  by?: string;
  licence: string;
  url: string;
  retrieved?: string;
  changes?: string;
}

export interface ReplayPack {
  id: string;
  title: { en: string; sl: string };
  range: [number, number];
  bbox: [number, number, number, number];
  built: string;
  board: Board;
  events: ReplayEvent[];
  wars: ReplayWar[];
  minimap: MinimapLane[];
  editorial: { anchors: unknown[]; add: unknown[]; drop: unknown[] };
  sources: Source[];
}
