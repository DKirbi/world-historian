import { useEffect, useRef } from 'react';
import { REGIONS } from '@/data/regions';
import { useTimeline, type Theme } from '@/state/store';
import { IconButton } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Icon';
import s from './App.module.scss';

const NEXT_THEME: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const THEME_ICON: Record<Theme, IconName> = {
  system: 'system',
  light: 'sun',
  dark: 'moon',
};
const THEME_LABEL: Record<Theme, string> = {
  system: 'Theme follows your device. Switch to light',
  light: 'Light theme. Switch to dark',
  dark: 'Dark theme. Switch to follow your device',
};

export function AppHeader() {
  const regionId = useTimeline((st) => st.regionId);
  const setRegion = useTimeline((st) => st.setRegion);
  const theme = useTimeline((st) => st.theme);
  const setTheme = useTimeline((st) => st.setTheme);
  const nav = useRef<HTMLElement>(null);

  // On narrow screens the region tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    const current = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const el = nav.current;
    if (!current || !el) return;
    const left = current.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft || left + current.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollLeft = left - (el.clientWidth - current.offsetWidth) / 2;
  }, [regionId]);

  return (
    <header className={s.header}>
      <h1 className={s.title}>World History Timeline</h1>
      <nav ref={nav} className={s.regions} aria-label="Regions">
        {REGIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={s.region}
            aria-current={r.id === regionId ? 'page' : undefined}
            disabled={!r.available}
            title={r.available ? undefined : `${r.label} is not built yet`}
            onClick={() => setRegion(r.id)}
          >
            {r.label}
            {!r.available && <span className={s.soon}>later</span>}
          </button>
        ))}
      </nav>
      <IconButton icon={THEME_ICON[theme]} label={THEME_LABEL[theme]} onClick={() => setTheme(NEXT_THEME[theme])} />
    </header>
  );
}
