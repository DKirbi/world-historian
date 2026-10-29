import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { DRAWER_MIN, useTimeline } from '@/state/store';
import { IconButton } from '@/components/ui/Button';
import s from './drawer.module.scss';

/** The chart keeps at least this much width beside the drawer in the side view. */
export const CHART_MIN = 240;
const STEP = 32;

interface Props {
  /** Accessible name of the drawer region. */
  label: string;
  /** Left side of the toolbar: actions on the content. */
  actions?: ReactNode;
  /** A plain title for utility panels (stories carry their own headline). */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Allow reading at full width (stories). */
  expandable?: boolean;
  onClose: () => void;
  /** Changes when the content changes, to scroll back to the top. */
  contentKey: string;
  children: ReactNode;
}

/**
 * Non-modal drawer on the right of the chart area. It covers part of the chart without resizing it,
 * so nothing re-flows while reading; the chart pans its focused country into the uncovered part.
 * Drag (or arrow-key) its left edge to resize; double-click the edge or use the toolbar to read at
 * full width. Escape closes it.
 */
export function Drawer({ label, actions, title, subtitle, expandable, onClose, contentKey, children }: Props) {
  const { t } = useI18n();
  const drawer = useTimeline((st) => st.drawer);
  const setDrawer = useTimeline((st) => st.setDrawer);
  const ref = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [hostW, setHostW] = useState(0);

  // The drawer sizes itself against the chart area it covers.
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const measure = () => setHostW(host.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const maxW = Math.max(DRAWER_MIN, hostW - CHART_MIN);
  const full = Boolean(expandable && drawer.full);
  const width = full ? hostW : Math.min(maxW, Math.max(DRAWER_MIN, drawer.width));
  const clamp = useCallback((w: number) => Math.min(maxW, Math.max(DRAWER_MIN, Math.round(w))), [maxW]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [contentKey]);

  // Resize by dragging the left edge.
  const drag = useRef<{ x: number; w: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (full || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width };
    document.body.dataset.resizing = '';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setDrawer({ width: clamp(drag.current.w + (drag.current.x - e.clientX)) });
  };
  const endDrag = () => {
    drag.current = null;
    delete document.body.dataset.resizing;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (full) return;
    const next =
      e.key === 'ArrowLeft' ? width + STEP : e.key === 'ArrowRight' ? width - STEP : e.key === 'Home' ? DRAWER_MIN : e.key === 'End' ? maxW : null;
    if (next === null) return;
    e.preventDefault();
    setDrawer({ width: clamp(next) });
  };

  return (
    <aside
      ref={ref}
      className={s.drawer}
      data-full={full || undefined}
      style={{ width: hostW ? width : undefined }}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {!full && (
        <div
          className={s.handle}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('drawer.resize')}
          aria-valuemin={DRAWER_MIN}
          aria-valuemax={maxW}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          onDoubleClick={() => expandable && setDrawer({ full: true })}
        >
          <span className={s.grip} aria-hidden="true" />
        </div>
      )}
      <header className={s.toolbar}>
        {title ? (
          <div className={s.titles}>
            <h2 className={s.title}>{title}</h2>
            {subtitle && <p className={s.subtitle}>{subtitle}</p>}
          </div>
        ) : (
          <div className={s.actions}>{actions}</div>
        )}
        <div className={s.windowButtons}>
          {expandable && (
            <IconButton
              icon={full ? 'collapse' : 'expand'}
              label={t(full ? 'drawer.restore' : 'drawer.expand')}
              onClick={() => setDrawer({ full: !full })}
            />
          )}
          <IconButton icon="close" label={t('drawer.close')} onClick={onClose} />
        </div>
      </header>
      <div ref={scroller} className={s.scroll}>
        {children}
      </div>
    </aside>
  );
}
