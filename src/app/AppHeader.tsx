import { useEffect, useRef } from 'react';
import { REGIONS } from '@/data/regions';
import { useTimeline, type Theme } from '@/state/store';
import { useI18n } from '@/i18n/useI18n';
import { regionText } from '@/i18n/regionText';
import { LOCALES, type Locale } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/i18n';
import { IconButton } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
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
const THEME_LABEL: Record<Theme, MessageKey> = {
  system: 'theme.system',
  light: 'theme.light',
  dark: 'theme.dark',
};

export function AppHeader() {
  const i18n = useI18n();
  const { t } = i18n;
  const regionId = useTimeline((st) => st.regionId);
  const setRegion = useTimeline((st) => st.setRegion);
  const theme = useTimeline((st) => st.theme);
  const setTheme = useTimeline((st) => st.setTheme);
  const locale = useTimeline((st) => st.locale);
  const setLocale = useTimeline((st) => st.setLocale);
  const nav = useRef<HTMLElement>(null);

  // On narrow screens the region tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    const current = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const el = nav.current;
    if (!current || !el) return;
    const left = current.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft || left + current.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollLeft = left - (el.clientWidth - current.offsetWidth) / 2;
  }, [regionId, locale]);

  return (
    <header className={s.header}>
      <h1 className={s.title}>{t('app.title')}</h1>
      <nav ref={nav} className={s.regions} aria-label={t('header.regions')}>
        {REGIONS.map((r) => {
          const label = regionText(i18n, r.id).label;
          return (
            <button
              key={r.id}
              type="button"
              className={s.region}
              aria-current={r.id === regionId ? 'page' : undefined}
              disabled={!r.available}
              title={r.available ? undefined : t('header.notBuilt', { region: label })}
              onClick={() => setRegion(r.id)}
            >
              {label}
              {!r.available && <span className={s.soon}>{t('header.later')}</span>}
            </button>
          );
        })}
      </nav>
      <div className={s.headerTools}>
        <SegmentedControl<Locale>
          label={t('header.language')}
          value={locale}
          onChange={setLocale}
          options={LOCALES.map((l) => ({ value: l.id, label: l.id.toUpperCase(), title: l.name }))}
        />
        <IconButton icon={THEME_ICON[theme]} label={t(THEME_LABEL[theme])} onClick={() => setTheme(NEXT_THEME[theme])} />
      </div>
    </header>
  );
}
