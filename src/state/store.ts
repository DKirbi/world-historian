import { create } from 'zustand';
import type { Lane, Year } from '@/data/types';
import { REGIONS } from '@/data/regions';
import type { Level } from '@/lib/levels';
import { detectLocale, rememberLocale, type Locale } from '@/i18n/locales';
import { decodeHash, encodeHash, type StoryRef } from './url';

export type { StoryRef } from './url';

export type LaneFilter = { kind: 'all' } | { kind: 'group'; group: string } | { kind: 'custom'; lanes: string[] };

/** Utility panels that share the drawer with stories. */
export type Panel = { kind: 'none' } | { kind: 'year' } | { kind: 'sources' };

export type Theme = 'system' | 'light' | 'dark';

export type ZoomCommand =
  | { type: 'years'; years: [Year, Year]; laneId?: string }
  | { type: 'by'; factor: number }
  | { type: 'level'; level: Level }
  | { type: 'reset' };

export interface DrawerState {
  /** Width of the side view, px. */
  width: number;
  /** Reading at the full width of the chart area. */
  full: boolean;
}

/** How a story change reaches the address bar: a new history entry, a replaced one, or none (already there). */
type HistoryMode = 'push' | 'replace' | 'none';

interface TimelineState {
  regionId: string;
  laneFilter: LaneFilter;
  /** Level of detail, derived from the visible time span by the chart (1 Eras … 4 Detail). */
  level: Level;
  /** Key-event markers on the chart. */
  showEvents: boolean;
  cursorYear: Year;
  /**
   * The one thing being read. Selecting a block opens its story; selecting another replaces it.
   * The story's state is followed across every country on the chart; closing the story clears it.
   */
  story: StoryRef | null;
  /** Bumped whenever a story is opened, so the chart re-focuses its country even for the same story. */
  storyNonce: number;
  panel: Panel;
  drawer: DrawerState;
  theme: Theme;
  locale: Locale;
  zoom: (ZoomCommand & { nonce: number }) | null;

  setRegion: (id: string, history?: HistoryMode) => void;
  setLaneFilter: (f: LaneFilter) => void;
  toggleLane: (laneId: string, allLaneIds: string[], visibleIds: string[]) => void;
  setLevel: (l: Level) => void;
  setShowEvents: (on: boolean) => void;
  setCursorYear: (y: Year) => void;
  openStory: (ref: StoryRef, history?: HistoryMode) => void;
  closeStory: (history?: HistoryMode) => void;
  openPanel: (p: Panel) => void;
  closePanel: () => void;
  setDrawer: (d: Partial<DrawerState>) => void;
  setTheme: (t: Theme) => void;
  setLocale: (l: Locale) => void;
  zoomTo: (cmd: ZoomCommand) => void;
}

const readTheme = (): Theme => {
  try {
    const t = localStorage.getItem('wht-theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
};

export const DRAWER_MIN = 360;
export const DRAWER_DEFAULT = 520;
const readDrawerWidth = (): number => {
  try {
    const w = Number(localStorage.getItem('wht-drawer-w'));
    return Number.isFinite(w) && w >= DRAWER_MIN ? w : DRAWER_DEFAULT;
  } catch {
    return DRAWER_DEFAULT;
  }
};

const available = (id: string) => REGIONS.some((r) => r.id === id && r.available);

/** The address the app opened with: #region, or #region/kind/id[/lane] for a story. */
const initial = (() => {
  try {
    const parsed = decodeHash(window.location.hash);
    if (parsed && available(parsed.regionId)) return parsed;
  } catch {
    /* no window */
  }
  return { regionId: 'europe', story: null as StoryRef | null };
})();

function writeHash(regionId: string, story: StoryRef | null, mode: HistoryMode) {
  if (mode === 'none') return;
  try {
    const hash = encodeHash(regionId, story);
    if (window.location.hash === hash) return;
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  } catch {
    /* some embedded viewers block history updates; the app still works without the address */
  }
}

let nonce = 0;

export const useTimeline = create<TimelineState>((set, get) => ({
  regionId: initial.regionId,
  laneFilter: { kind: 'all' },
  level: 1,
  showEvents: true,
  cursorYear: 1500,
  story: initial.story,
  storyNonce: initial.story ? 1 : 0,
  panel: { kind: 'none' },
  drawer: { width: readDrawerWidth(), full: false },
  theme: readTheme(),
  locale: detectLocale(),
  zoom: null,

  setRegion: (regionId, history = 'replace') => {
    writeHash(regionId, null, history);
    set({
      regionId,
      laneFilter: { kind: 'all' },
      story: null,
      panel: { kind: 'none' },
    });
  },
  setLaneFilter: (laneFilter) => set({ laneFilter }),
  toggleLane: (laneId, allLaneIds, visibleIds) =>
    set(() => {
      const next = visibleIds.includes(laneId) ? visibleIds.filter((id) => id !== laneId) : [...visibleIds, laneId];
      const ordered = allLaneIds.filter((id) => next.includes(id));
      return {
        laneFilter: ordered.length === allLaneIds.length ? { kind: 'all' } : { kind: 'custom', lanes: ordered },
      };
    }),
  setLevel: (level) => set({ level }),
  setShowEvents: (showEvents) => set({ showEvents }),
  setCursorYear: (cursorYear) => set({ cursorYear }),
  openStory: (story, history = 'push') => {
    writeHash(get().regionId, story, history);
    set((s) => ({ story, storyNonce: s.storyNonce + 1, panel: { kind: 'none' } }));
  },
  closeStory: (history = 'push') => {
    if (!get().story) return;
    writeHash(get().regionId, null, history);
    set({ story: null, drawer: { ...get().drawer, full: false } });
  },
  openPanel: (panel) => {
    if (get().story) writeHash(get().regionId, null, 'push');
    set({ panel, story: null });
  },
  closePanel: () => set({ panel: { kind: 'none' } }),
  setDrawer: (d) => {
    const drawer = { ...get().drawer, ...d };
    if (d.width !== undefined) {
      try {
        localStorage.setItem('wht-drawer-w', String(Math.round(drawer.width)));
      } catch {
        /* storage unavailable: the width lasts for this visit */
      }
    }
    set({ drawer });
  },
  setTheme: (theme) => {
    try {
      if (theme === 'system') localStorage.removeItem('wht-theme');
      else localStorage.setItem('wht-theme', theme);
    } catch {
      /* storage can be unavailable; the choice then lasts for this visit */
    }
    set({ theme });
  },
  setLocale: (locale) => {
    rememberLocale(locale);
    set({ locale });
  },
  zoomTo: (cmd) => set({ zoom: { ...cmd, nonce: ++nonce } }),
}));

/** Apply the address after back/forward or an edited link, without writing it again. */
export function applyHash(hash: string) {
  const parsed = decodeHash(hash);
  if (!parsed || !available(parsed.regionId)) return;
  const st = useTimeline.getState();
  if (parsed.regionId !== st.regionId) st.setRegion(parsed.regionId, 'none');
  if (parsed.story) useTimeline.getState().openStory(parsed.story, 'none');
  else useTimeline.getState().closeStory('none');
}

/** Lanes shown for the current filter, in chart order. */
export function selectLanes(lanes: Lane[], filter: LaneFilter): Lane[] {
  if (filter.kind === 'all') return lanes;
  if (filter.kind === 'group') return lanes.filter((l) => l.group === filter.group);
  const keep = new Set(filter.lanes);
  return lanes.filter((l) => keep.has(l.id));
}

/** Id of the polity a story follows across the chart, if any. */
export const followedPolity = (story: StoryRef | null) => (story?.kind === 'polity' ? story.id : null);
