import { useCallback, useState } from 'react';
import type { Lane } from '@/data/types';
import { groupLabel } from '@/data/regions';
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
  const [open, setOpen] = useState(false);
  const toggleLane = useTimeline((st) => st.toggleLane);
  const setLaneFilter = useTimeline((st) => st.setLaneFilter);
  const close = useCallback(() => setOpen(false), []);
  const visibleIds = visible.map((l) => l.id);
  const allIds = lanes.map((l) => l.id);
  const groups = [...new Set(lanes.map((l) => l.group))];
  const label =
    visible.length === lanes.length
      ? 'All countries'
      : `${visible.length} ${visible.length === 1 ? 'country' : 'countries'}`;

  return (
    <Popover
      open={open}
      onClose={close}
      label="Choose countries"
      trigger={
        <Button trailingIcon="chevron" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {label}
        </Button>
      }
    >
      <div className={s.pickerHead}>
        <Button variant="quiet" onClick={() => setLaneFilter({ kind: 'all' })}>
          Show all
        </Button>
        <Button variant="quiet" onClick={() => setLaneFilter({ kind: 'custom', lanes: [] })}>
          Clear
        </Button>
      </div>
      {groups.map((g) => (
        <fieldset key={g} className={s.pickerGroup}>
          <legend>{groupLabel(g)}</legend>
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
                <span>{l.label}</span>
              </label>
            ))}
        </fieldset>
      ))}
    </Popover>
  );
}
