import { create } from 'zustand';
import type { Lane, Year } from '@/data/types';
import { REGIONS } from '@/data/regions';
import type { Level } from '@/lib/levels';

export type LaneFilter = { kind: 'all' } | { kind: 'group'; group: string } | { kind: 'custom'; lanes: string[] };

export type Panel =
  | { kind: 'none' }
  | { kind: 'polity'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'year' }
  | { kind: 'sources' };

export type Theme = 'system' | 'light' | 'dark';
export type HighlightSlot = 1 | 2 | 3;
export interface Highlight {
  id: string;
  slot: HighlightSlot;
}

export type ZoomCommand =
  | { type: 'years'; years: [Year, Year]; laneId?: string }
  | { type: 'by'; factor: number }
  | { type: 'level'; level: Level }
  | { type: 'reset' };

interface TimelineState {
  regionId: string;
  laneFilter: LaneFilter;
  /** Level of detail, derived from the visible time span by the chart (1 Eras … 4 Detail). */
  level: Level;
  /** Key-event markers on the chart. */
  showEvents: boolean;
  cursorYear: Year;
  /** Up to three polities painted in highlight colours. A slot stays with its polity until removed. */
  highlights: Highlight[];
  panel: Panel;
  theme: Theme;
  zoom: (ZoomCommand & { nonce: number }) | null;

  setRegion: (id: string) => void;
  setLaneFilter: (f: LaneFilter) => void;
  toggleLane: (laneId: string, allLaneIds: string[], visibleIds: string[]) => void;
  setLevel: (l: Level) => void;
  setShowEvents: (on: boolean) => void;
  setCursorYear: (y: Year) => void;
  selectPolity: (id: string) => void;
  toggleHighlight: (id: string) => void;
  removeHighlight: (id: string) => void;
  openPanel: (p: Panel) => void;
  closePanel: () => void;
  setTheme: (t: Theme) => void;
  zoomTo: (cmd: ZoomCommand) => void;
}

const SLOTS: HighlightSlot[] = [1, 2, 3];

function withHighlight(list: Highlight[], id: string): Highlight[] {
  if (list.some((h) => h.id === id)) return list;
  const used = new Set(list.map((h) => h.slot));
  const free = SLOTS.find((s) => !used.has(s));
  if (free) return [...list, { id, slot: free }];
  const [oldest, ...rest] = list; // all slots taken: the oldest gives up its colour
  return [...rest, { id, slot: oldest.slot }];
}

const readTheme = (): Theme => {
  try {
    const t = localStorage.getItem('wht-theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
};

/** A bare #region anchor (e.g. #americas) opens that region. */
const readRegion = (): string => {
  try {
    const id = window.location.hash.replace(/^#/, '');
    return REGIONS.some((r) => r.id === id && r.available) ? id : 'europe';
  } catch {
    return 'europe';
  }
};

let nonce = 0;

export const useTimeline = create<TimelineState>((set) => ({
  regionId: readRegion(),
  laneFilter: { kind: 'all' },
  level: 1,
  showEvents: true,
  cursorYear: 1500,
  highlights: [],
  panel: { kind: 'none' },
  theme: readTheme(),
  zoom: null,

  setRegion: (regionId) => {
    try {
      window.history.replaceState(null, '', `#${regionId}`);
    } catch {
      /* some embedded viewers block history updates; the region still switches */
    }
    set({
      regionId,
      laneFilter: { kind: 'all' },
      highlights: [],
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
  selectPolity: (id) =>
    set((s) => ({
      panel: { kind: 'polity', id },
      highlights: withHighlight(s.highlights, id),
    })),
  toggleHighlight: (id) =>
    set((s) => ({
      highlights: s.highlights.some((h) => h.id === id)
        ? s.highlights.filter((h) => h.id !== id)
        : withHighlight(s.highlights, id),
    })),
  removeHighlight: (id) => set((s) => ({ highlights: s.highlights.filter((h) => h.id !== id) })),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: { kind: 'none' } }),
  setTheme: (theme) => {
    try {
      if (theme === 'system') localStorage.removeItem('wht-theme');
      else localStorage.setItem('wht-theme', theme);
    } catch {
      /* storage can be unavailable; the choice then lasts for this visit */
    }
    set({ theme });
  },
  zoomTo: (cmd) => set({ zoom: { ...cmd, nonce: ++nonce } }),
}));

/** Lanes shown for the current filter, in chart order. */
export function selectLanes(lanes: Lane[], filter: LaneFilter): Lane[] {
  if (filter.kind === 'all') return lanes;
  if (filter.kind === 'group') return lanes.filter((l) => l.group === filter.group);
  const keep = new Set(filter.lanes);
  return lanes.filter((l) => keep.has(l.id));
}
