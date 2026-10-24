import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { StoryModel } from './templates';
import { useArticleLink } from './useArticle';
import { headlineFromTitle } from './wiki';
import s from './linkcard.module.scss';

/**
 * The phone view of a story: what was selected, when and where, and one link to its Wikipedia
 * article in the reader's language (or English). The full newspaper drawer is desktop-only for now.
 */
export function StoryLinkCard({ model, onClose }: { model: StoryModel; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const link = useArticleLink(model.article, i18n.meta.wiki);
  const heading = useRef<HTMLHeadingElement>(null);
  // A name the data has only in English takes the title of the reader's own article, as in the drawer.
  const translated =
    link.title && link.lang === i18n.meta.wiki && model.kind !== 'stack' && model.headlineLang !== i18n.meta.tag && !model.article?.section && !model.article?.sectionLike
      ? headlineFromTitle(link.title)
      : null;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [model.key]);

  return (
    <aside
      className={s.card}
      aria-label={t('drawer.label')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className={s.text}>
        {model.kicker && <p className={s.kicker}>{model.kicker}</p>}
        <h2 ref={heading} tabIndex={-1} className={s.headline} lang={translated ? i18n.meta.tag : model.headlineLang}>
          {translated ?? model.headline}
        </h2>
        {model.dateline && <p className={s.dateline}>{model.dateline}</p>}
        {link.status === 'ready' && link.url ? (
          <a className={s.link} href={link.url} target="_blank" rel="noreferrer" hrefLang={link.lang}>
            {t('story.mobile.read')}
            <Icon name="external" size={16} />
          </a>
        ) : (
          <p className={s.pending}>{t(link.status === 'loading' ? 'story.mobile.resolving' : 'story.mobile.none')}</p>
        )}
      </div>
      <IconButton icon="close" label={t('drawer.close')} onClick={onClose} />
    </aside>
  );
}
