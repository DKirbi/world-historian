import s from './SegmentedControl.module.scss';

interface Option<T extends string> {
  value: T;
  label: string;
  /** Tooltip explaining the option. */
  title?: string;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}

/** Radio group styled as a segmented switch. */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={s.group}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={s.option}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const i = options.findIndex((x) => x.value === value);
            const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
            onChange(next.value);
            (
              e.currentTarget.parentElement?.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null
            )?.focus();
          }}
          data-value={o.value}
          title={o.title}
          tabIndex={o.value === value ? 0 : -1}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
