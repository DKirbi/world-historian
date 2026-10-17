import { useEffect, useRef, type ReactNode } from 'react';
import s from './Popover.module.scss';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Trigger element(s); clicks inside the wrapper do not count as outside clicks. */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  label: string;
}

/** Anchored, non-modal popover. Closes on Escape and on a click outside. */
export function Popover({ open, onClose, trigger, children, align = 'start', label }: Props) {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={wrap} className={s.wrap}>
      {trigger}
      {open && (
        <div role="dialog" aria-label={label} className={[s.panel, s[align]].join(' ')}>
          {children}
        </div>
      )}
    </div>
  );
}
