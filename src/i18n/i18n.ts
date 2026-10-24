import { Children, createElement, Fragment, type ReactNode } from 'react';
import { IntlMessageFormat } from 'intl-messageformat';
import en from './messages/en.json';
import sl from './messages/sl.json';
import slNames from './names/sl.json';
import { createFmt, type Fmt } from './format';
import { localeMeta, type Locale, type LocaleMeta } from './locales';

/** English is the source catalogue: every other locale must have exactly its keys (checked by a unit test). */
export type MessageKey = keyof typeof en;
type Catalogue = Record<MessageKey, string>;
type Primitive = string | number | boolean | null | undefined;
export type Values = Record<string, Primitive>;
/** Values for rich messages: tags such as <b>…</b> map to functions, placeholders may be React nodes. */
export type RichValues = Record<string, Primitive | ReactNode | ((chunks: ReactNode[]) => ReactNode)>;

const CATALOGUES: Record<Locale, Catalogue> = { en, sl: sl as Catalogue };

interface Names {
  lanes?: Record<string, string>;
  polities?: Record<string, string>;
  events?: Record<string, string>;
  eras?: Record<string, string>;
}
const NAMES: Partial<Record<Locale, Names>> = { sl: slNames as Names };

export interface I18n {
  locale: Locale;
  meta: LocaleMeta;
  fmt: Fmt;
  /** Plain-text message. Falls back to English when a key is missing, then to the key itself. */
  t(key: MessageKey, values?: Values): string;
  /** Message with markup tags and React-node placeholders. */
  rich(key: MessageKey, values: RichValues): ReactNode;
  /** True when the key exists in the catalogue (dynamic keys such as region notes). */
  has(key: string): boolean;
  /** Message by a computed key, or `fallback` when the catalogue has no such key. */
  tx(key: string, fallback: string, values?: Values): string;
  /** Keys under a prefix, in numeric order: region notes "region.europe.note.1", ".2"… */
  all(prefix: string): string[];
  /** Name of a country column in this language. */
  lane(lane: { id: string; label: string }): string;
  /** Name of a polity in this language, when the names snapshot has one; else the data's name. */
  polity(p: { id: string; name: string }): string;
  /** Name of a key event in this language, when the names snapshot has one; else the data's name. */
  event(e: { id: string; name: string }): string;
  /** Name of a cited era in this language, when its own article has one; else the data's name. */
  era(e: { id: string; name: string }): string;
  /** BCP 47 tag of a name: the reader's language when translated, else English (the data's language). */
  nameLang(kind: 'polity' | 'event' | 'era', id: string): string;
  quote(text: string): string;
}

const cache = new Map<string, IntlMessageFormat>();

function formatter(locale: Locale, key: string, message: string): IntlMessageFormat {
  const id = `${locale}\u0000${key}`;
  let f = cache.get(id);
  if (!f) {
    f = new IntlMessageFormat(message, localeMeta(locale).tag, undefined, { ignoreTag: false });
    cache.set(id, f);
  }
  return f;
}

function lookup(locale: Locale, key: string): { message: string; locale: Locale } | null {
  const own = (CATALOGUES[locale] as Record<string, string>)[key];
  if (own !== undefined) return { message: own, locale };
  const fallback = (CATALOGUES.en as Record<string, string>)[key];
  if (fallback !== undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] "${key}" missing in ${locale}`);
    return { message: fallback, locale: 'en' };
  }
  return null;
}

const instances = new Map<Locale, I18n>();

export function createI18n(locale: Locale): I18n {
  const hit = instances.get(locale);
  if (hit) return hit;
  const names = NAMES[locale] ?? {};
  const fmt = createFmt(locale);

  const format = (key: string, values?: Values) => {
    const found = lookup(locale, key);
    if (!found) return key;
    // A value ending in an abbreviation ("1 n. št.") before the message's own full stop leaves two; keep one.
    return String(formatter(found.locale, key, found.message).format(values ?? {})).replace(/(?<!\.)\.\.(?!\.)/g, '.');
  };

  const i18n: I18n = {
    locale,
    meta: localeMeta(locale),
    fmt,
    t: (key, values) => format(key, values),
    rich: (key, values) => {
      const found = lookup(locale, key);
      if (!found) return key;
      const out = formatter(found.locale, key, found.message).format<ReactNode>(values as never);
      return Array.isArray(out) ? createElement(Fragment, null, ...Children.toArray(out)) : out;
    },
    has: (key) => key in CATALOGUES[locale] || key in CATALOGUES.en,
    tx: (key, fallback, values) => (lookup(locale, key) ? format(key, values) : fallback),
    all: (prefix) =>
      Object.keys(CATALOGUES.en)
        .filter((k) => k.startsWith(prefix) && /^\d+$/.test(k.slice(prefix.length)))
        .sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)))
        .map((k) => format(k)),
    lane: (l) => names.lanes?.[l.id] ?? l.label,
    polity: (p) => names.polities?.[p.id] ?? p.name,
    event: (e) => names.events?.[e.id] ?? e.name,
    era: (e) => names.eras?.[e.id] ?? e.name,
    nameLang: (kind, id) =>
      locale === 'en' || (kind === 'polity' ? names.polities : kind === 'event' ? names.events : names.eras)?.[id]
        ? localeMeta(locale).tag
        : 'en',
    quote: (text) => format('quote', { text }),
  };
  instances.set(locale, i18n);
  return i18n;
}
