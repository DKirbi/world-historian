import { useMemo, type CSSProperties } from 'react';
import type { RegionData } from '@/data/types';
import { useTimeline } from '@/state/store';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { slotColor } from '@/features/timeline/colors';
import { regionMeta } from '@/data/regions';
import { LEVELS } from '@/lib/levels';
import s from './Legend.module.scss';

const TIERS = [
  { tier: 1, label: 'Held most of the country (50% or more)' },
  { tier: 2, label: 'Held a large part (20%+ or 100,000 km²+)' },
  { tier: 3, label: 'Held a smaller part' },
] as const;

/** Key to the encodings, the reader's highlights, and the source credit. */
export function Legend({ region }: { region: RegionData }) {
  const highlights = useTimeline((st) => st.highlights);
  const removeHighlight = useTimeline((st) => st.removeHighlight);
  const openPanel = useTimeline((st) => st.openPanel);
  const tiers = TIERS; // "Major powers" can show lone smaller states, so all three tiers stay in the key
  const note = regionMeta(region.id).chartNote;
  const showEvents = useTimeline((st) => st.showEvents);
  const level = useTimeline((st) => st.level);
  const hasEvents = useMemo(() => Object.keys(region.events).length > 0, [region.events]);
  const hasUnmapped = useMemo(
    () => Object.values(region.spansByLane).some((spans) => spans.some((sp) => sp.extent === 'unknown')),
    [region.spansByLane],
  );

  return (
    <footer className={s.legend}>
      <p className={s.levelHint}>
        <strong>{LEVELS[level - 1].label}:</strong> {LEVELS[level - 1].hint.toLowerCase()}.{' '}
        {level <= 2 ? 'Tap a block to zoom in.' : 'Tap a block for its details.'}
      </p>
      {level === 1 ? (
        <ul className={s.keys} aria-label="Chart key">
          <li>
            <span className={s.box} style={{ '--fill': 'var(--era-1)' } as CSSProperties} aria-hidden="true" />
            <span className={s.box} style={{ '--fill': 'var(--era-2)' } as CSSProperties} aria-hidden="true" />
            Periods of a culture area, from a cited periodization, or the region’s period bins
          </li>
        </ul>
      ) : (
        <ul className={s.keys} aria-label="Chart key">
          {tiers.map((t) => (
            <li key={t.tier}>
              <span
                className={s.box}
                style={{ '--fill': `var(--tier-${t.tier})` } as CSSProperties}
                aria-hidden="true"
              />
              {t.label}
            </li>
          ))}
          <li>
            <svg className={s.box} viewBox="0 0 14 14" aria-hidden="true">
              <defs>
                <pattern
                  id="legend-hatch"
                  width="4"
                  height="4"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="4" style={{ stroke: 'var(--hatch)' }} strokeWidth="1.4" />
                </pattern>
              </defs>
              <rect width="14" height="14" rx="3" style={{ fill: 'var(--tier-1)' }} />
              <rect width="14" height="14" rx="3" fill="url(#legend-hatch)" />
            </svg>
            Counting its vassal states
          </li>
          {hasUnmapped && (
            <li>
              <svg className={s.box} viewBox="0 0 14 14" aria-hidden="true">
                <rect
                  x="0.75"
                  y="0.75"
                  width="12.5"
                  height="12.5"
                  rx="3"
                  style={{
                    fill: 'var(--unmapped)',
                    stroke: 'var(--unmapped-edge)',
                  }}
                  strokeWidth="1.25"
                  strokeDasharray="3 2"
                />
              </svg>
              Added from Wikidata, territory not mapped
            </li>
          )}
          {hasEvents && showEvents && level >= 3 && (
            <li>
              <svg className={s.box} viewBox="0 0 14 14" aria-hidden="true">
                <circle
                  cx="7"
                  cy="7"
                  r="4"
                  style={{ fill: 'var(--event)', stroke: 'var(--surface)' }}
                  strokeWidth="1.5"
                />
              </svg>
              Key event (Wikidata)
            </li>
          )}
        </ul>
      )}

      {highlights.length > 0 && (
        <div className={s.highlights} role="group" aria-label="Highlighted states">
          {highlights.map((h) => (
            <Chip
              key={h.id}
              swatch={slotColor(h.slot)}
              removable
              aria-label={`Remove highlight from ${region.polities[h.id]?.name ?? h.id}`}
              onClick={() => removeHighlight(h.id)}
            >
              {region.polities[h.id]?.name ?? h.id}
            </Chip>
          ))}
        </div>
      )}

      {note && <p className={s.note}>{note}</p>}

      <Button variant="quiet" className={s.credit} onClick={() => openPanel({ kind: 'sources' })}>
        {region.sources.some((x) => x.id === 'wikidata')
          ? 'Data: Cliopatria (CC BY 4.0), Wikidata'
          : 'Data: Cliopatria, CC BY 4.0'}
      </Button>
    </footer>
  );
}
