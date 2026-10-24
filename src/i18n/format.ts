import type { Year } from '@/data/types';
import type { Locale } from './locales';

/**
 * Locale-aware formatting of years, ranges, shares and areas.
 *
 * English keeps the chart's long-standing conventions ("476 CE", "27 BCE", "c. 1200").
 * Slovenian follows Slovenski pravopis: "476 n. št.", "27 pr. n. št.", "ok. 1200", "16. stoletje",
 * with no-break spaces inside the abbreviations so they never wrap across lines.
 */
export interface Fmt {
  locale: Locale;
  /** 1500 → "1500", 476 → "476 CE" / "476 n. št.", -27 → "27 BCE" / "27 pr. n. št." */
  year(y: Year): string;
  /** Compact range with the era written once where possible. Uses an en dash. */
  range(from: Year, to: Year): string;
  /** "BCE" / "pr. n. št." (or "CE" / "n. št." for years 1–999), empty for later years. */
  eraSuffix(y: Year): string;
  /** "c. " / "ok. " */
  approx: string;
  share(share: number): string;
  area(km2: number): string;
  number(n: number): string;
  /** "1 year", "641 years" / "1 leto", "2 leti", "3 leta", "5 let" */
  duration(from: Year, to: Year): string;
  spanRange(span: { from: Year; to: Year; approx?: boolean }): string;
  /** "62%", or "not mapped" for states whose territory the map source does not cover. */
  spanShare(span: { peak?: number; extent?: string }): string;
  /** Wikidata [year, precision] as Wikidata displays it: 1873, "1600s", "16th century". */
  wdTime(t: [Year, number] | undefined): string;
  eventDate(e: { year: Year; to?: Year; prec?: number }): string;
  /** Time phrase for running text: "in 1066", "from 1337 to 1453", "in the 1620s" / "leta 1066", "med letoma 1337 in 1453". */
  when(e: { year: Year; to?: Year; prec?: number }): string;
  /** "A, B and C" / "A, B in C" */
  list(items: string[]): string;
}

const NB = ' ';

interface EraWords {
  bce: string;
  ce: string;
  approx: string;
  notMapped: string;
  decade: (y: number) => string;
  century: (n: number) => string;
  millennium: (n: number) => string;
  years: (n: number) => string;
}

const ordinalEn = (n: number) => {
  const t = n % 100;
  const suffix =
    t >= 11 && t <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
};

const slYears = (n: number) => {
  const m = n % 100;
  if (m === 1) return `${n} leto`;
  if (m === 2) return `${n} leti`;
  if (m === 3 || m === 4) return `${n} leta`;
  return `${n} let`;
};

const WORDS: Record<Locale, EraWords> = {
  en: {
    bce: 'BCE',
    ce: 'CE',
    approx: 'c. ',
    notMapped: 'not mapped',
    decade: (y) => `${y}s`,
    century: (n) => `${ordinalEn(n)} century`,
    millennium: (n) => `${ordinalEn(n)} millennium`,
    years: (n) => (n === 1 ? '1 year' : `${n} years`),
  },
  sl: {
    bce: `pr.${NB}n.${NB}št.`,
    ce: `n.${NB}št.`,
    approx: `ok.${NB}`,
    notMapped: 'ni na zemljevidu',
    decade: (y) => `${y}.${NB}leta`,
    century: (n) => `${n}.${NB}stoletje`,
    millennium: (n) => `${n}.${NB}tisočletje`,
    years: slYears,
  },
};

const NUMBER_LOCALE: Record<Locale, string> = { en: 'en-US', sl: 'sl-SI' };

export function createFmt(locale: Locale): Fmt {
  const w = WORDS[locale];
  const nf = new Intl.NumberFormat(NUMBER_LOCALE[locale]);
  const pf = new Intl.NumberFormat(NUMBER_LOCALE[locale], { style: 'percent', maximumFractionDigits: 0 });
  const lf = new Intl.ListFormat(NUMBER_LOCALE[locale], { style: 'long', type: 'conjunction' });

  const year = (y: Year) => {
    if (y < 0) return `${-y}${NB}${w.bce}`;
    if (y < 1000) return `${y}${NB}${w.ce}`;
    return String(y);
  };
  // English keeps an ordinary space before the era, as before; only Slovenian needs the no-break space.
  const yearOut = locale === 'en' ? (y: Year) => year(y).replace(NB, ' ') : year;
  const sp = locale === 'en' ? ' ' : NB;

  const range = (from: Year, to: Year) => {
    if (from === to) return yearOut(from);
    if (to < 0) return `${-from}–${-to}${sp}${w.bce}`;
    if (from >= 0) return to < 1000 ? `${from}–${to}${sp}${w.ce}` : `${from}–${to}`;
    return `${yearOut(from)} – ${yearOut(to)}`;
  };

  const wdTime = (t: [Year, number] | undefined) => {
    if (!t) return '?';
    const [y, prec] = t;
    const era = y < 0 ? `${sp}${w.bce}` : '';
    if (prec >= 9) return yearOut(y);
    if (prec === 8) return y < 0 ? `${w.decade(-y)}${era}` : y < 1000 ? `${w.decade(y)}${sp}${w.ce}` : w.decade(y);
    const size = prec === 7 ? 100 : 1000;
    const n = Math.floor((Math.abs(y) - 1) / size) + 1;
    return `${prec === 7 ? w.century(n) : w.millennium(n)}${era}`;
  };

  const share = (s: number) => (s > 0 && s < 0.005 ? `<${pf.format(0.01)}` : pf.format(Math.round(s * 100) / 100));

  return {
    locale,
    year: yearOut,
    range,
    eraSuffix: (y) => (y < 0 ? w.bce : y < 1000 ? w.ce : ''),
    approx: w.approx,
    share,
    area: (km2) => `${nf.format(km2)} km²`,
    number: (n) => nf.format(n),
    duration: (from, to) => w.years(to - from + 1),
    spanRange: (span) => (span.approx ? `${w.approx}${range(span.from, span.to)}` : range(span.from, span.to)),
    spanShare: (span) => (span.extent === 'unknown' || span.peak === undefined ? w.notMapped : share(span.peak)),
    wdTime,
    eventDate: (e) => {
      if (e.prec === 8) {
        const decade = wdTime([e.year, 8]);
        return e.to !== undefined ? `${decade} – ${yearOut(e.to)}` : decade;
      }
      const r = e.to !== undefined ? range(e.year, e.to) : yearOut(e.year);
      return e.prec !== undefined && e.prec < 8 ? `${w.approx}${r}` : r;
    },
    when: (e) => when(locale, e, yearOut, wdTime),
    list: (items) => lf.format(items),
  };
}

/** Running-text time phrases. Ranges write the era once when both ends share it, as `range` does. */
function when(
  locale: Locale,
  e: { year: Year; to?: Year; prec?: number },
  year: (y: Year) => string,
  wdTime: (t: [Year, number]) => string,
): string {
  const { year: a, to: b, prec } = e;
  const both = (x: Year, y: Year) => (y < 0 ? [String(-x), year(y)] : x >= 0 && y >= 1000 ? [String(x), String(y)] : [year(x), year(y)]);
  if (locale === 'sl') {
    if (prec === 8) return b !== undefined ? `od ${wdTime([a, 8]).replace(/leta$/, 'let')} do leta ${year(b)}` : `v ${wdTime([a, 8]).replace(/leta$/, 'letih')}`;
    if (b !== undefined && b !== a) {
      const [x, y] = both(a, b);
      return `${prec !== undefined && prec < 8 ? 'približno ' : ''}med letoma ${x} in ${y}`;
    }
    return prec !== undefined && prec < 8 ? `okoli leta ${year(a)}` : `leta ${year(a)}`;
  }
  if (prec === 8) return b !== undefined ? `from the ${wdTime([a, 8])} to ${year(b)}` : `in the ${wdTime([a, 8])}`;
  if (b !== undefined && b !== a) {
    const [x, y] = both(a, b);
    return `${prec !== undefined && prec < 8 ? 'roughly ' : ''}from ${x} to ${y}`;
  }
  return prec !== undefined && prec < 8 ? `around ${year(a)}` : `in ${year(a)}`;
}
