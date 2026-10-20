import type { Span } from '@/data/types';

/**
 * Fill and label colour for a block. Colour is reserved for what the reader picked: the state whose
 * story is open is painted in the selection colour in every country; everything else is the stone
 * ramp for its share of the country, or pale for states whose territory is not mapped.
 */
export function blockColors(span: Span, selected = false) {
  if (selected) return { fill: 'var(--sel)', ink: 'var(--sel-ink)' };
  if (span.extent === 'unknown') return { fill: 'var(--unmapped)', ink: 'var(--unmapped-ink)' };
  return {
    fill: `var(--tier-${span.tier})`,
    ink: `var(--tier-${span.tier}-ink)`,
  };
}
