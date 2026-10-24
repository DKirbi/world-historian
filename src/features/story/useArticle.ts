import { useCallback, useEffect, useState } from 'react';
import { fetchImageCredit, loadArticle, resolveTitle, articleUrl, type ArticleRef, type ImageCredit, type WikiArticle } from './wiki';
import { hasTranslations, loadTranslations, type StoredTranslation } from './translations';

export type TranslationState = { status: 'none' | 'loading' } | { status: 'ready'; translation: StoredTranslation };

/** The stored translation of the English article `enTitle` into `lang`, when there is one. */
export function useStoredTranslation(lang: string, enTitle: string | undefined): TranslationState {
  const wanted = !!enTitle && hasTranslations(lang);
  const [state, setState] = useState<TranslationState>({ status: wanted ? 'loading' : 'none' });
  useEffect(() => {
    if (!wanted || !enTitle) {
      setState({ status: 'none' });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    loadTranslations(lang)
      .then((all) => {
        const tr = all.get(enTitle);
        if (live) setState(tr ? { status: 'ready', translation: tr } : { status: 'none' });
      })
      .catch(() => live && setState({ status: 'none' }));
    return () => {
      live = false;
    };
  }, [lang, enTitle, wanted]);
  return state;
}

export type ArticleState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; article: WikiArticle }
  | { status: 'error' };

const refKey = (ref: ArticleRef | null) => (ref ? JSON.stringify(ref) : '');

/** The story's Wikipedia article in `lang`, loaded when the story opens; cancelled when it changes. */
export function useArticle(ref: ArticleRef | null, lang: string): ArticleState & { retry: () => void } {
  const [state, setState] = useState<ArticleState>(() => (ref ? { status: 'loading' } : { status: 'none' }));
  const [attempt, setAttempt] = useState(0);
  const key = refKey(ref);

  useEffect(() => {
    if (!ref) {
      setState({ status: 'none' });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    loadArticle(ref, lang, ctrl.signal)
      .then((article) => !ctrl.signal.aborted && setState(article ? { status: 'ready', article } : { status: 'none' }))
      .catch((e: Error) => {
        if (!ctrl.signal.aborted && e.name !== 'AbortError') setState({ status: 'error' });
      });
    return () => ctrl.abort();
    // `key` stands for `ref`, whose identity changes on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** Author and licence of the lead image, read once the image is shown. */
export function useImageCredit(lang: string | undefined, file: string | undefined): ImageCredit | null {
  const [credit, setCredit] = useState<ImageCredit | null>(null);
  useEffect(() => {
    setCredit(null);
    if (!lang || !file) return;
    const ctrl = new AbortController();
    fetchImageCredit(lang, file, ctrl.signal)
      .then((c) => !ctrl.signal.aborted && setCredit(c))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [lang, file]);
  return credit;
}

/** Just the link, for the phone view: the article URL in `lang`, or the English one. */
type LinkState = { status: 'none' | 'loading' | 'ready'; url?: string; lang?: string; title?: string };

export function useArticleLink(ref: ArticleRef | null, lang: string): LinkState {
  const [state, setState] = useState<LinkState>({ status: ref ? 'loading' : 'none' });
  const key = refKey(ref);
  useEffect(() => {
    if (!ref) {
      setState({ status: 'none' });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    (async () => {
      const own = lang !== 'en' ? await resolveTitle(ref, lang, ctrl.signal).catch(() => null) : null;
      if (own) return { status: 'ready' as const, url: articleUrl(lang, own), lang, title: own };
      const en = ref.enTitle ?? (await resolveTitle(ref, 'en', ctrl.signal).catch(() => null));
      return en ? { status: 'ready' as const, url: articleUrl('en', en), lang: 'en', title: en } : { status: 'none' as const };
    })().then((s: LinkState) => !ctrl.signal.aborted && setState(s));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang]);
  return state;
}
