/** Languages the interface and the stories are written in. Add a locale here, then its message file. */
export type Locale = 'en' | 'sl';

export interface LocaleMeta {
  id: Locale;
  /** The language's own name, as shown in the language switch. */
  name: string;
  /** BCP 47 tag for <html lang> and Intl. */
  tag: string;
  /** Wikipedia edition the stories are read from. */
  wiki: string;
}

export const LOCALES: readonly LocaleMeta[] = [
  { id: 'en', name: 'English', tag: 'en', wiki: 'en' },
  { id: 'sl', name: 'Slovenščina', tag: 'sl', wiki: 'sl' },
];

export const DEFAULT_LOCALE: Locale = 'en';

export const isLocale = (x: unknown): x is Locale => LOCALES.some((l) => l.id === x);

export const localeMeta = (id: Locale): LocaleMeta => LOCALES.find((l) => l.id === id) ?? LOCALES[0];

const STORAGE_KEY = 'wht-lang';

/** ?lang= in the address wins (shared links), then the reader's last choice, then the browser's languages. */
export function detectLocale(): Locale {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (isLocale(q)) return q;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* no storage or no window: fall through to the browser languages */
  }
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const tag of langs) {
    const base = tag?.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function rememberLocale(id: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
    const url = new URL(window.location.href);
    if (id === DEFAULT_LOCALE) url.searchParams.delete('lang');
    else url.searchParams.set('lang', id);
    window.history.replaceState(window.history.state, '', url);
  } catch {
    /* embedded viewers can block storage and history; the choice then lasts for this visit */
  }
}
