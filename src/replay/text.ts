import type { Locale } from '@/i18n/locales';
import { createFmt } from '@/i18n/format';
import type { WdDate } from './types';

/** Interface text of the replay prototype. It moves into the ICU catalogues (src/i18n/messages) if the replay
 *  becomes part of the app. */
const STRINGS = {
  en: {
    prototype: 'Prototype',
    play: 'Play',
    pause: 'Pause',
    prev: 'Previous event',
    next: 'Next event',
    restart: 'From the start',
    speed: 'Speed',
    major: 'Major events',
    all: 'All events',
    follow: 'Follow the events',
    following: 'Following',
    free: 'Camera free',
    close: 'Close',
    keep: 'Keep open',
    resume: 'Continue',
    more: 'Read more',
    less: 'Less',
    sides: 'Sides on Wikidata',
    noText: 'No stored Wikipedia text yet; the line above is the Wikidata description.',
    yearOnly: 'year only',
    monthOnly: 'month only',
    noPlace: 'place not recorded',
    dateConflict: (d: string) => `Wikidata gives this date; the Wikipedia text below gives ${d}${d.endsWith('.') ? '' : '.'}`,
    atSea: 'at sea',
    machine: 'AI translation, not reviewed',
    added: 'Added by the editors',
    legendRome: 'Rome',
    legendStates: 'Other states',
    legendNone: 'No state recorded',
    legendRealm: 'Within a realm',
    legendEvent: 'Event',
    legendNow: 'Now',
    minimap: 'The chart, for these countries',
    chart: 'Chart',
    wars: 'Wars',
    sources: 'Sources',
    about:
      'Borders are Cliopatria’s map snapshots drawn as hexagons; events are Wikidata’s, at the place and date it records, with the stored Wikipedia text. Nothing on the board is simulated.',
    remaining: (min: number) => `about ${min} min`,
    of: (a: number, b: number) => `${a} of ${b}`,
    keys: 'Space play or pause · ← → previous or next event · Esc close',
    classes: {
      battle: 'Battle',
      siege: 'Siege',
      treaty: 'Treaty',
      invasion: 'Invasion',
      campaign: 'Campaign',
      coup: 'Coup',
      war: 'War',
      rebellion: 'Rebellion',
      event: 'Event',
    } as Record<string, string>,
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsOf: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
  sl: {
    prototype: 'Prototip',
    play: 'Predvajaj',
    pause: 'Ustavi',
    prev: 'Prejšnji dogodek',
    next: 'Naslednji dogodek',
    restart: 'Od začetka',
    speed: 'Hitrost',
    major: 'Glavni dogodki',
    all: 'Vsi dogodki',
    follow: 'Sledi dogodkom',
    following: 'Sledi',
    free: 'Prosta kamera',
    close: 'Zapri',
    keep: 'Pusti odprto',
    resume: 'Nadaljuj',
    more: 'Več',
    less: 'Manj',
    sides: 'Strani na Wikipodatkih',
    noText: 'Besedila iz Wikipedije še nimamo shranjenega; zgornja vrstica je opis z Wikipodatkov.',
    yearOnly: 'znano le leto',
    monthOnly: 'znan le mesec',
    noPlace: 'kraj ni zabeležen',
    dateConflict: (d: string) => `Datum je z Wikipodatkov; besedilo Wikipedije spodaj navaja ${d}${d.endsWith('.') ? '' : '.'}`,
    atSea: 'na morju',
    machine: 'Strojni prevod, ni pregledan',
    added: 'Dodalo uredništvo',
    legendRome: 'Rim',
    legendStates: 'Druge države',
    legendNone: 'Država ni zabeležena',
    legendRealm: 'Znotraj vplivnega območja',
    legendEvent: 'Dogodek',
    legendNow: 'Zdaj',
    minimap: 'Kronološki prikaz teh držav',
    chart: 'Kronologija',
    wars: 'Vojne',
    sources: 'Viri',
    about:
      'Meje so Cliopatrini posnetki zemljevidov, narisani v šesterokotnikih; dogodki so z Wikipodatkov, na kraju in z datumom, ki ju ti navajajo, s shranjenim besedilom Wikipedije. Na plošči ni ničesar simuliranega.',
    remaining: (min: number) => `približno ${min} min`,
    of: (a: number, b: number) => `${a} od ${b}`,
    keys: 'Preslednica predvajaj ali ustavi · ← → prejšnji ali naslednji dogodek · Esc zapri',
    classes: {
      battle: 'Bitka',
      siege: 'Obleganje',
      treaty: 'Pogodba',
      invasion: 'Vpad',
      campaign: 'Pohod',
      coup: 'Udar',
      war: 'Vojna',
      rebellion: 'Upor',
      event: 'Dogodek',
    } as Record<string, string>,
    months: ['januar', 'februar', 'marec', 'april', 'maj', 'junij', 'julij', 'avgust', 'september', 'oktober', 'november', 'december'],
    /** After a day number Slovenian takes the genitive: "2. avgusta 216 pr. n. št." */
    monthsOf: ['januarja', 'februarja', 'marca', 'aprila', 'maja', 'junija', 'julija', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'],
  },
};

export type Strings = (typeof STRINGS)['en'];

export function strings(locale: Locale): Strings {
  return STRINGS[locale];
}

/** A date as Wikidata records it, as precise as it is: "2 August 216 BCE", "November 218 BCE", "216 BCE". */
export function formatDate(d: WdDate, locale: Locale): { text: string; note: string | null } {
  const fmt = createFmt(locale);
  const t = STRINGS[locale];
  const [y, m, day, prec] = d;
  const year = fmt.year(y);
  if (prec >= 11 && m && day) {
    return { text: locale === 'sl' ? `${day}. ${t.monthsOf[m - 1]} ${year}` : `${day} ${t.months[m - 1]} ${year}`, note: null };
  }
  if (prec === 10 && m) return { text: `${t.months[m - 1]} ${year}`, note: t.monthOnly };
  return { text: year, note: t.yearOnly };
}
