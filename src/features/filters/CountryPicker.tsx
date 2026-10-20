import { useCallback, useState } from 'react';
import type { Lane } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { groupName } from '@/i18n/regionText';
import { useTimeline } from '@/state/store';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import s from './FilterBar.module.scss';

interface Props {
  lanes: Lane[];
  visible: Lane[];
}

/** Pick exactly which countries sit side by side. */
export function CountryPicker({ lanes, visible }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const [open, setOpen] = useState(false);
  const toggleLane = useTimeline((st) => st.toggleLane);
  const setLaneFilter = useTimeline((st) => st.setLaneFilter);
  const close = useCallback(() => setOpen(false), []);
  const visibleIds = visible.map((l) => l.id);
  const allIds = lanes.map((l) => l.id);
  const groups = [...new Set(lanes.map((l) => l.group))];
  const label = visible.length === lanes.length ? t('countries.all') : t('countries.count', { n: visible.length });

  return (
    <Popover
      open={open}
      onClose={close}
      label={t('countries.choose')}
      trigger={
        <Button trailingIcon="chevron" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {label}
        </Button>
      }
    >
      <div className={s.pickerHead}>
        <Button variant="quiet" onClick={() => setLaneFilter({ kind: 'all' })}>
          {t('countries.showAll')}
        </Button>
        <Button variant="quiet" onClick={() => setLaneFilter({ kind: 'custom', lanes: [] })}>
          {t('countries.clear')}
        </Button>
      </div>
      {groups.map((g) => (
        <fieldset key={g} className={s.pickerGroup}>
          <legend>{groupName(i18n, g)}</legend>
          {lanes
            .filter((l) => l.group === g)
            .map((l) => (
              <label key={l.id} className={s.pickerItem}>
                <input
                  type="checkbox"
                  id={`lane-${l.id}`}
                  checked={visibleIds.includes(l.id)}
                  onChange={() => toggleLane(l.id, allIds, visibleIds)}
                />
                <span>{i18n.lane(l)}</span>
              </label>
            ))}
        </fieldset>
      ))}
    </Popover>
  );
}
