import { useEffect } from 'react';
import { useRegionData } from '@/data/useRegionData';
import { applyHash, useTimeline } from '@/state/store';
import { useI18n } from '@/i18n/useI18n';
import { FilterBar } from '@/features/filters/FilterBar';
import { Timeline } from '@/features/timeline/Timeline';
import { DrawerHost } from '@/features/story/DrawerHost';
import { Legend } from '@/features/legend/Legend';
import { AppHeader } from './AppHeader';
import s from './App.module.scss';

export function App() {
  const regionId = useTimeline((st) => st.regionId);
  const theme = useTimeline((st) => st.theme);
  const i18n = useI18n();
  const region = useRegionData(regionId);

  // Follow the address after back/forward or an edited link: #region, or #region/kind/id/lane.
  useEffect(() => {
    const onHash = () => applyHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  // The page's language follows the reader's choice, for hyphenation, screen readers and translation tools.
  useEffect(() => {
    document.documentElement.lang = i18n.meta.tag;
    document.title = i18n.t('app.title');
  }, [i18n]);

  return (
    <div className={s.app}>
      <AppHeader />
      {region.status === 'ready' ? (
        <>
          <FilterBar region={region.data} />
          <main className={s.main}>
            <Timeline key={region.data.id} region={region.data} />
            <DrawerHost region={region.data} />
          </main>
          <Legend region={region.data} />
        </>
      ) : (
        <main className={s.status}>
          {region.status === 'loading' ? i18n.t('app.loading') : i18n.t('app.loadError', { message: region.message })}
        </main>
      )}
    </div>
  );
}
