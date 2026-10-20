import { useMemo } from 'react';
import type { RegionData } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { useMediaQuery } from '@/lib/hooks';
import { useTimeline } from '@/state/store';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { YearSnapshot } from '@/features/details/YearSnapshot';
import { SourcesPanel } from '@/features/details/SourcesPanel';
import { Drawer } from './Drawer';
import { Story } from './Story';
import { StoryLinkCard } from './StoryLinkCard';
import { buildStory } from './templates';
import s from './drawer.module.scss';

/** Phones get the story as a link for now; the full drawer comes to phones in a later version. */
export const PHONE_QUERY = '(max-width: 719px)';

/** Whatever the drawer shows: the open story, the year list, or sources. */
export function DrawerHost({ region }: { region: RegionData }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const story = useTimeline((st) => st.story);
  const panel = useTimeline((st) => st.panel);
  const full = useTimeline((st) => st.drawer.full);
  const closeStory = useTimeline((st) => st.closeStory);
  const closePanel = useTimeline((st) => st.closePanel);
  const zoomTo = useTimeline((st) => st.zoomTo);
  const setDrawer = useTimeline((st) => st.setDrawer);
  const cursorYear = useTimeline((st) => st.cursorYear);
  const phone = useMediaQuery(PHONE_QUERY);

  const model = useMemo(() => (story ? buildStory(story, { region, i18n }) : null), [story, region, i18n]);

  if (model) {
    if (phone) return <StoryLinkCard model={model} onClose={() => closeStory()} />;
    return (
      <Drawer
        label={t('drawer.label')}
        expandable
        contentKey={model.key}
        onClose={() => closeStory()}
        actions={
          model.zoom && (
            <Button
              icon="target"
              variant="ghost"
              onClick={() => {
                if (full) setDrawer({ full: false });
                zoomTo({ type: 'years', years: model.zoom!.years, laneId: model.zoom!.laneId });
              }}
            >
              {t('drawer.showOnChart')}
            </Button>
          )
        }
      >
        <Story model={model} region={region} full={full} />
      </Drawer>
    );
  }

  if (panel.kind === 'none') return null;
  const regionLabel = t(`region.${region.id}.label` as Parameters<typeof t>[0]);
  const title = panel.kind === 'year' ? t('year.title', { region: regionLabel, year: fmt.year(cursorYear) }) : t('drawer.sourcesTitle');
  const subtitle = panel.kind === 'year' ? t('year.subtitle') : undefined;
  const body = panel.kind === 'year' ? <YearSnapshot region={region} /> : <SourcesPanel region={region} />;

  if (phone)
    return (
      <Sheet title={title} subtitle={subtitle} onClose={closePanel} focusKey={panel.kind} closeLabel={t('drawer.close')}>
        {body}
      </Sheet>
    );
  return (
    <Drawer label={title} title={title} subtitle={subtitle} contentKey={panel.kind} onClose={closePanel}>
      <div className={s.panelBody}>{body}</div>
    </Drawer>
  );
}
