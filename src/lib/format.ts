import type { Year } from '@/data/types';

/** 1500 → "1500", 476 → "476 CE", -27 → "27 BCE" */
export function formatYear(y: Year): string {
  if (y < 0) return `${-y} BCE`;
  if (y < 1000) return `${y} CE`;
  return String(y);
}

/** Compact range with the era written once where possible. Uses an en dash. */
export function formatRange(from: Year, to: Year): string {
  if (from === to) return formatYear(from);
  if (to < 0) return `${-from}–${-to} BCE`;
  if (from >= 0) return to < 1000 ? `${from}–${to} CE` : `${from}–${to}`;
  return `${formatYear(from)} – ${formatYear(to)}`;
}

/** Axis label: shorter than formatYear, the era is implied by position. */
export function formatTick(y: Year): string {
  if (y < 0) return `${-y} BCE`;
  if (y === 0) return '0';
  return String(y);
}

export const formatShare = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);

/** 207000 → "207,000 km²" */
export const formatArea = (km2: number) => `${km2.toLocaleString('en-US')} km²`;

export const formatDuration = (from: Year, to: Year) => {
  const n = to - from + 1;
  return n === 1 ? '1 year' : `${n} years`;
};

/** A span's years, with "c." when the source only gives them to the decade or century. */
export function formatSpanRange(span: { from: Year; to: Year; approx?: boolean }): string {
  return span.approx ? `c. ${formatRange(span.from, span.to)}` : formatRange(span.from, span.to);
}

/** Share column: "62%", or a dash for states whose territory is not mapped. */
export const formatSpanShare = (span: { peak?: number; extent?: string }) =>
  span.extent === 'unknown' || span.peak === undefined ? 'not mapped' : formatShare(span.peak);

const ordinal = (n: number) => {
  const t = n % 100;
  const suffix =
    t >= 11 && t <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
};

/**
 * Wikidata [year, precision] as Wikidata itself displays it: 1873 (year or finer), "1600s" (decade),
 * "16th century" for +1600 at century precision (1501–1600), "2nd millennium" for millennia.
 */
export function formatWdTime(t: [Year, number] | undefined): string {
  if (!t) return '?';
  const [y, prec] = t;
  const era = y < 0 ? ' BCE' : '';
  if (prec >= 9) return formatYear(y);
  if (prec === 8) return y < 0 ? `${-y}s BCE` : y < 1000 ? `${y}s CE` : `${y}s`;
  const size = prec === 7 ? 100 : 1000;
  const n = Math.floor((Math.abs(y) - 1) / size) + 1;
  return `${ordinal(n)} ${prec === 7 ? 'century' : 'millennium'}${era}`;
}

/** An event's date: "1066", "1337–1453", "1600s" when Wikidata gives only the decade. */
export function formatEventDate(e: { year: Year; to?: Year; prec?: number }): string {
  if (e.prec === 8) {
    const decade = formatWdTime([e.year, 8]);
    return e.to !== undefined ? `${decade} – ${formatYear(e.to)}` : decade;
  }
  const range = e.to !== undefined ? formatRange(e.year, e.to) : formatYear(e.year);
  return e.prec !== undefined && e.prec < 8 ? `c. ${range}` : range;
}
