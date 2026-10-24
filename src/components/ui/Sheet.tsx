import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';
import s from './Sheet.module.scss';

interface Props {
  title: ReactNode;
  /** Short line under the title. */
  subtitle?: ReactNode;
  onClose: () => void;
  /** Focus moves to the title when this changes (not on every title update). */
  focusKey?: string;
  /** Accessible name of the close button, in the reader's language. */
  closeLabel?: string;
  children: ReactNode;
}

/**
 * Non-modal side panel on wide screens, bottom sheet on phones. The chart stays
 * usable behind it. Escape closes; focus moves to the title when it opens.
 */
export function Sheet({ title, subtitle, onClose, focusKey, closeLabel = 'Close panel', children }: Props) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <aside
      className={s.sheet}
      aria-labelledby={headingId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <header className={s.head}>
        <div className={s.titles}>
          <h2 id={headingId} ref={heading} tabIndex={-1} className={s.title}>
            {title}
          </h2>
          {subtitle && <p className={s.subtitle}>{subtitle}</p>}
        </div>
        <IconButton icon="close" label={closeLabel} onClick={onClose} />
      </header>
      <div className={s.body}>{children}</div>
    </aside>
  );
}
