import type { Year } from '@/data/types';

/**
 * What a reader can open as a story. `lane` is the country it was selected from: the chart keeps
 * that column in view beside the drawer, and the story is told from that country's point of view.
 */
export type StoryRef =
  | { kind: 'polity'; id: string; lane?: string }
  | { kind: 'event'; id: string; lane?: string }
  | { kind: 'era'; id: string; lane?: string }
  /** Several small states of one column, gathered into one "+N" block, listed for a run of years. */
  | { kind: 'stack'; lane: string; from: Year; to: Year };

/**
 * Deep links. `#europe` opens a region (as before); a story adds its kind and id, and the column:
 *   #europe/state/habsburg-monarchy/slovenia
 *   #europe/event/Q83224/united-kingdom
 *   #americas/era/andes-early-horizon/peru
 *   #europe/stack/germany/1250/1300
 */
const KIND_TO_PATH = { polity: 'state', event: 'event', era: 'era', stack: 'stack' } as const;

export function encodeHash(regionId: string, story: StoryRef | null): string {
  if (!story) return `#${regionId}`;
  const seg = (s: string | number) => encodeURIComponent(String(s));
  if (story.kind === 'stack')
    return `#${regionId}/stack/${seg(story.lane)}/${seg(story.from)}/${seg(story.to)}`;
  const path = `#${regionId}/${KIND_TO_PATH[story.kind]}/${seg(story.id)}`;
  return story.lane ? `${path}/${seg(story.lane)}` : path;
}

export function decodeHash(hash: string): { regionId: string; story: StoryRef | null } | null {
  const parts = hash.replace(/^#/, '').split('/').map((p) => decodeURIComponent(p));
  const [regionId, kind, a, b, c] = parts;
  if (!regionId) return null;
  if (!kind) return { regionId, story: null };
  if (kind === 'stack') {
    const from = Number(b);
    const to = Number(c);
    if (!a || !Number.isFinite(from) || !Number.isFinite(to)) return { regionId, story: null };
    return { regionId, story: { kind: 'stack', lane: a, from, to } };
  }
  if (!a) return { regionId, story: null };
  const lane = b || undefined;
  if (kind === 'state') return { regionId, story: { kind: 'polity', id: a, lane } };
  if (kind === 'event') return { regionId, story: { kind: 'event', id: a, lane } };
  if (kind === 'era') return { regionId, story: { kind: 'era', id: a, lane } };
  return { regionId, story: null };
}

export const sameStory = (a: StoryRef | null, b: StoryRef | null) => encodeHash('', a) === encodeHash('', b);
