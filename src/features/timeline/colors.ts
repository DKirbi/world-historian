import type { Span } from '@/data/types';
import type { HighlightSlot } from '@/state/store';

/** Fill and label colour for a block: highlight slot if picked, else unmapped, else the territory-share tier. */
export function blockColors(span: Span, slot?: HighlightSlot) {
  if (slot) return { fill: `var(--hl-${slot})`, ink: `var(--hl-${slot}-ink)` };
  if (span.extent === 'unknown') return { fill: 'var(--unmapped)', ink: 'var(--unmapped-ink)' };
  return {
    fill: `var(--tier-${span.tier})`,
    ink: `var(--tier-${span.tier}-ink)`,
  };
}

export const slotColor = (slot: HighlightSlot) => `var(--hl-${slot})`;
export const SLOT_NAMES: Record<HighlightSlot, string> = {
  1: 'blue',
  2: 'orange',
  3: 'green',
};
