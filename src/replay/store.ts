import { create } from 'zustand';
import type { Locale } from '@/i18n/locales';
import type { ClockState } from './clock';
import type { Mode } from './model';

export type Card = { kind: 'event'; index: number; pinned: boolean } | { kind: 'war'; id: string; pinned: boolean };

export interface ReplayState {
  lang: Locale;
  mode: Mode;
  speed: 1 | 2 | 4;
  playing: boolean;
  clock: ClockState;
  card: Card | null;
  /** The camera follows the events until the reader moves the map themselves. */
  follow: boolean;
  set: (patch: Partial<Omit<ReplayState, 'set'>>) => void;
}

export const useReplay = create<ReplayState>((set) => ({
  lang: 'en',
  mode: 'major',
  speed: 1,
  playing: false,
  clock: { year: 0, cursor: 0, dwell: 0, current: -1 },
  card: null,
  follow: true,
  set: (patch) => set(patch),
}));
