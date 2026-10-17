import { useEffect, useState } from 'react';
import { regionSource } from './source';
import { REGIONS } from './regions';
import type { RegionData } from './types';

type State = { status: 'ready'; data: RegionData } | { status: 'loading' } | { status: 'error'; message: string };

export function useRegionData(regionId: string): State {
  const [state, setState] = useState<State>(() => {
    const data = regionSource.peek(regionId);
    return data ? { status: 'ready', data } : { status: 'loading' };
  });

  useEffect(() => {
    let alive = true;
    const data = regionSource.peek(regionId);
    if (data) {
      setState({ status: 'ready', data });
      return;
    }
    setState({ status: 'loading' });
    regionSource
      .load(regionId)
      .then((d) => {
        if (!alive) return;
        setState({ status: 'ready', data: d });
        regionSource.prefetch(REGIONS.filter((r) => r.available && r.id !== regionId).map((r) => r.id));
      })
      .catch((e: Error) => alive && setState({ status: 'error', message: e.message }));
    return () => {
      alive = false;
    };
  }, [regionId]);

  return state;
}
