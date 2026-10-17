import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';
import s from './Chip.module.scss';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  /** CSS colour for a leading swatch, e.g. a highlight slot. */
  swatch?: string;
  /** Show a trailing ✕ (the whole chip is the remove action). */
  removable?: boolean;
  children: ReactNode;
}

export function Chip({ pressed, swatch, removable, children, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={[s.chip, pressed && s.pressed, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {swatch && <span className={s.swatch} style={{ '--swatch': swatch } as CSSProperties} aria-hidden="true" />}
      <span className={s.text}>{children}</span>
      {removable && <Icon name="close" size={14} />}
    </button>
  );
}
