import { useEffect } from 'react';
import { useRegionData } from '@/data/useRegionData';
import { REGIONS } from '@/data/regions';
import { useTimeline } from '@/state/store';
import { FilterBar } from '@/features/filters/FilterBar';
import { Timeline } from '@/features/timeline/Timeline';
import { DetailPanel } from '@/features/details/DetailPanel';
import { Legend } from '@/features/legend/Legend';
import { AppHeader } from './AppHeader';
import s from './App.module.scss';

export function App() {
  const regionId = useTimeline((st) => st.regionId);
  const theme = useTimeline((st) => st.theme);
  const region = useRegionData(regionId);

  // Follow the #region anchor when it changes after load (back/forward, edited links).
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace(/^#/, '');
      const st = useTimeline.getState();
      if (id !== st.regionId && REGIONS.some((r) => r.id === id && r.available)) st.setRegion(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className={s.app}>
      <AppHeader />
      {region.status === 'ready' ? (
        <>
          <FilterBar region={region.data} />
          <main className={s.main}>
            <Timeline key={region.data.id} region={region.data} />
            <DetailPanel region={region.data} />
          </main>
          <Legend region={region.data} />
        </>
      ) : (
        <main className={s.status}>
          {region.status === 'loading' ? 'Loading the chart…' : `The chart could not load: ${region.message}`}
        </main>
      )}
    </div>
  );
}
