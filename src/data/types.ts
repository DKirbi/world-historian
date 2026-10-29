/** Years are integers; negative = BCE. A span covers [from, to] inclusive. */
export type Year = number;
export type Tier = 1 | 2 | 3;

export interface Source {
  id: string;
  title: string;
  url: string;
  license: string;
  licenseUrl?: string;
  version?: string;
  doi?: string;
  authors?: string;
  changes?: string;
  /** Snapshot date for live databases (Wikidata, Wikipedia). */
  retrieved?: string;
}

export interface Period {
  id: string;
  label: string;
  years: [Year, Year];
}

export interface Lane {
  id: string;
  label: string;
  group: string;
  order: number;
  km2: number;
  minShare: number;
  /** Natural Earth countries (or parts) merged into this lane. */
  naturalEarth?: string[];
  periods: string[];
  spans: number;
  /** Key events placed in this lane. */
  events?: number;
}

/** A lane the build left out because the source has no polity there. */
export interface OmittedLane {
  id: string;
  label: string;
  naturalEarth: string[];
  reason: string;
  /** Citation for the reason, when it states historical facts. */
  source?: string;
}

/** One polity holding part of one lane's territory over a run of years. */
export interface Span {
  id: string;
  name: string;
  from: Year;
  to: Year;
  /** Highest share (0–1) of the modern country's area held during the span. Absent when the extent is unknown. */
  peak?: number;
  /** Largest area (km², rounded) held inside the modern country during the span. */
  km2?: number;
  tier: Tier;
  /** Peak came from the polity together with its vassal states. */
  realm?: boolean;
  /** Shown because most of the polity lay inside this country, though it covered a small share of it. */
  inside?: boolean;
  /** Shown because it held at least 100,000 km² of the country, though under its share threshold. */
  large?: boolean;
  /** A state the map source does not cover, added from Wikidata: its territory is not mapped. */
  extent?: 'unknown';
  /** Where the dates of an unmapped state come from. */
  cited?: 'wikidata' | 'wikipedia';
  /** Start or end is only known to the decade, century or "c." */
  approx?: boolean;
  /** An archaeological culture or people from Wikipedia's culture lists, not a state. */
  kind?: 'culture';
}

export interface Cite {
  page: string;
  url: string;
  /** Link to the exact revision that was read. */
  permalink: string;
  quote: string;
  /** Further text of the cited row, e.g. its list of cultures and sites. */
  text?: string;
}

/** How a culture from the Wikipedia lists was dated and placed. */
export interface CultureInfo {
  dates: {
    by: 'list' | 'wikidata' | 'period';
    approx: boolean;
    cite?: Cite[];
    wd?: [WdTime, WdTime];
  };
  place: {
    lanes: string[];
    by: 'list' | 'list-country' | 'coordinates' | 'country' | 'article' | 'source-page';
    text?: string;
    matched?: string[];
    article?: string;
    permalink?: string;
    quote?: string;
    page?: string;
    cite?: Cite;
  };
  listed: Cite[];
  languages?: number;
}

export interface EraArea {
  id: string;
  /** Null for areas made from a lane group's period bins. */
  label: string | null;
  group?: string;
  lanes: string[];
  note?: string;
  sources?: Array<{
    page: string;
    url: string;
    permalink: string;
    revid: number;
  }>;
  bins?: boolean;
}

/** One block of the Eras level: a period of a culture area, or a region period bin. */
export interface Era {
  id: string;
  area: string;
  name: string;
  from: Year;
  to: Year;
  lanes: string[];
  leaders: Array<{ id: string; name: string }>;
  /** source: the records the cited row names; data: computed from the chart's spans. */
  leadersBy: 'source' | 'data' | null;
  cite?: Cite;
  /** The period's own Wikipedia article, read from the link in its cited row (a section when given). */
  article?: { title: string; section?: string };
  basis?: 'period-bin';
  approx?: boolean;
  clippedFrom?: Year;
  /** Other scholarly definitions of the same period, from PeriodO. */
  periodo?: Array<{
    label: string;
    from: Year | null;
    to: Year | null;
    url: string;
    source: string;
  }>;
}

export interface ErasFile {
  region: string;
  note: string;
  areas: EraArea[];
  eras: Era[];
}

/** Wikidata time value: [year, precision] with precision 9 = year, 8 = decade, 7 = century, 11 = day. */
export type WdTime = [Year, number];

/** The build's check of a polity's Wikidata link. */
export interface WikidataCheck {
  /** The item the chart links to; absent when no trustworthy item was found. */
  id?: string;
  /** ok: dates fit · unknown: no dates to compare · corrected: replaced via the Wikipedia title · mismatch: link hidden */
  status: 'ok' | 'unknown' | 'corrected' | 'mismatch';
  label?: string;
  start?: WdTime;
  end?: WdTime;
  /** The id the map source gave, when the build replaced or hid it. */
  sourceId?: string;
  sourceLabel?: string;
  /** Number of Wikipedia language editions. */
  languages?: number;
}

export interface CitedDate {
  year?: Year;
  /** "wikidata" or the URL of the quoted article. */
  source?: string;
  quote?: string;
  prec?: number;
  approx?: boolean;
  ongoing?: boolean;
  /** The coarse Wikidata value behind `year` (a decade or century). */
  wd?: WdTime;
}

/** How an unmapped state was dated and placed. */
export interface SupplementInfo {
  start: CitedDate;
  end: CitedDate;
  place: {
    lane: string;
    by: 'cited' | 'present-day' | 'coordinates' | 'capital' | 'country' | 'capital-country';
    url?: string;
    quote?: string;
    coord?: [number, number];
    wikidata?: string;
  };
  dateNote?: string;
}

export type EventType =
  'battle' | 'siege' | 'invasion' | 'campaign' | 'war' | 'revolution' | 'rebellion' | 'coup' | 'treaty' | 'pandemic';

/** A key event from Wikidata, placed in a lane. */
export interface HistEvent {
  /** Wikidata item id. */
  id: string;
  name: string;
  year: Year;
  /** Last year, for events that ran over several years. */
  to?: Year;
  /** Wikidata precision of the start when coarser than a year (8 decade, 7 century). */
  prec?: number;
  type: EventType;
  /** Number of Wikipedia language editions with an article: the ranking used to thin markers. */
  links: number;
  /** How the build placed it in the lane. */
  by: 'coordinates' | 'location' | 'country';
  /** English Wikipedia title. */
  wiki?: string;
  /** Section of that article, when the event is told in a section of a longer page (link-fixes.json). */
  wikiSection?: string;
  /** The link a hand correction replaced (data/sources/link-fixes.json). */
  linkFix?: string;
}

export interface Polity {
  id: string;
  name: string;
  years: [Year, Year];
  wikidata?: string;
  wikipedia?: string;
  /** Section of that article, when the state is told in a section of a longer page (link-fixes.json). */
  wikipediaSection?: string;
  /** The link a hand correction replaced (data/sources/link-fixes.json); the Wikidata item no longer
   *  stands in for the article, since it was chosen for the old link. */
  linkFix?: string;
  seshat?: string[];
  realmOnly?: boolean;
  wd?: WikidataCheck;
  supplement?: SupplementInfo;
  culture?: CultureInfo;
}

export interface ReviewItem {
  id: string;
  name: string;
  years: [Year, Year];
  severity: 'check' | 'info';
  flags: string[];
}

/** File shapes as written by data/tools/build_region.py */
export interface RegionIndexFile {
  region: string;
  generated: string;
  sources: Source[];
  periods: Period[];
  periodNote?: string;
  periodSources?: string[];
  omittedLanes?: OmittedLane[];
  tiers: Record<string, string>;
  params: Record<string, number>;
  cited?: {
    linkCheck?: Record<string, number> | null;
    events?: {
      minSitelinks: number;
      maxCountryLanes: number;
      nearKm: number;
      outcomes: Record<string, number>;
    } | null;
    cultures?: {
      kept: number;
      undated: string[];
      unplaced: string[];
      living: string[];
      onChart: string[];
      excluded: string[];
      notCulture: string[];
      outside: string[];
    };
  };
  lanes: Lane[];
}
export interface PeriodFile {
  lane: string;
  period: string;
  years: [Year, Year];
  source: string;
  spans: Span[];
  events?: HistEvent[];
}
export interface PolitiesFile {
  region: string;
  source: string;
  polities: Polity[];
}
export interface ReviewFile {
  region: string;
  items: ReviewItem[];
}

/** Everything the UI needs for one region, deduplicated and indexed. */
export interface RegionData {
  id: string;
  sources: Source[];
  periods: Period[];
  periodNote?: string;
  periodSources: string[];
  omittedLanes: OmittedLane[];
  lanes: Lane[];
  spansByLane: Record<string, Span[]>;
  polities: Record<string, Polity>;
  /** For each polity, every lane span it appears in. */
  appearances: Record<string, Array<{ laneId: string; span: Span }>>;
  review: Record<string, ReviewItem>;
  eventsByLane: Record<string, HistEvent[]>;
  /** Every event once, with the lanes it appears in. */
  events: Record<string, { event: HistEvent; laneIds: string[] }>;
  cited?: RegionIndexFile['cited'];
  eras: Era[];
  eraAreas: Record<string, EraArea>;
}
