import { useMemo, type CSSProperties } from 'react';
import type { RegionData } from '@/data/types';
import { useTimeline } from '@/state/store';
import { useI18n } from '@/i18n/useI18n';
import { regionText } from '@/i18n/regionText';
import { Button } from '@/components/ui/Button';
import { LEVELS } from '@/lib/levels';
import s from './Legend.module.scss';

const TIERS = [1, 2, 3] as const;

/** Key to the encodings, how to read a block, and the source credit. */
export function Legend({ region }: { region: RegionData }) {
  const i18n = useI18n();
  const { t } = i18n;
  const openPanel = useTimeline((st) => st.openPanel);
  const note = regionText(i18n, region.id).chartNote;
  const showEvents = useTimeline((st) => st.showEvents);
  const level = useTimeline((st) => st.level);
  const hasEvents = useMemo(() => Object.keys(region.events).length > 0, [region.events]);
  const hasUnmapped = useMemo(
    () => Object.values(region.spansByLane).some((spans) => spans.some((sp) => sp.extent === 'unknown')),
    [region.spansByLane],
  );
  const id = LEVELS[level - 1].id;

  return (
    <footer className={s.legend}>
      <p className={s.levelHint}>
        {i18n.rich('legend.levelHint', {
          level: t(`level.${id}`),
          hint: t(`level.${id}.hint`).toLocaleLowerCase(i18n.meta.tag),
          b: (chunks) => <strong>{chunks}</strong>,
        })}{' '}
        {t(level <= 2 ? 'legend.actionHintZoom' : 'legend.actionHint')}
      </p>
      {level === 1 ? (
        <ul className={s.keys} aria-label={t('legend.key')}>
          <li>
            <span className={s.box} style={{ '--fill': 'var(--era-1)' } as CSSProperties} aria-hidden="true" />
            <span className={s.box} style={{ '--fill': 'var(--era-2)' } as CSSProperties} aria-hidden="true" />
            {t('legend.eras')}
          </li>
        </ul>
      ) : (
        <ul className={s.keys} aria-label={t('legend.key')}>
          {TIERS.map((tier) => (
            <li key={tier}>
              <span className={s.box} style={{ '--fill': `var(--tier-${tier})` } as CSSProperties} aria-hidden="true" />
              {t(`legend.tier.${tier}`)}
            </li>
          ))}
          <li>
            <svg className={s.box} viewBox="0 0 14 14" aria-hidden="true">
              <defs>
                <pattern id="legend-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="4" style={{ stroke: 'var(--hatch)' }} strokeWidth="1.4" />
                </pattern>
              </defs>
              <rect width="14" height="14" rx="3" style={{ fill: 'var(--tier-1)' }} />
              <rect width="14" height="14" rx="3" fill="url(#legend-hatch)" />
            </svg>
            {t('legend.vassals')}
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
                  style={{ fill: 'var(--unmapped)', stroke: 'var(--unmapped-edge)' }}
                  strokeWidth="1.25"
                  strokeDasharray="3 2"
                />
              </svg>
              {t('legend.unmapped')}
            </li>
          )}
          {level >= 3 && (
            <li>
              <svg className={s.box} viewBox="0 0 14 14" aria-hidden="true">
                <rect x="0.5" y="0.5" width="13" height="13" rx="3" style={{ fill: 'var(--stack)', stroke: 'var(--stack-edge)' }} />
                <text x="7" y="10.5" textAnchor="middle" style={{ fill: 'var(--ink)', fontSize: 10, fontWeight: 600 }}>
                  +
                </text>
              </svg>
              {t('legend.stack')}
            </li>
          )}
          {hasEvents && showEvents && level >= 3 && (
            <li>
              <svg className={s.box} viewBox="0 0 14 14" aria-hidden="true">
                <circle cx="7" cy="7" r="4" style={{ fill: 'var(--event)', stroke: 'var(--surface)' }} strokeWidth="1.5" />
              </svg>
              {t('legend.event')}
            </li>
          )}
        </ul>
      )}

      {note && <p className={s.note}>{note}</p>}

      <Button variant="quiet" className={s.credit} onClick={() => openPanel({ kind: 'sources' })}>
        {region.sources.some((x) => x.id === 'wikidata') ? t('legend.credit') : t('legend.creditPlain')}
      </Button>
    </footer>
  );
}
