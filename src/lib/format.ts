import type { Year } from '@/data/types';
import { createFmt } from '@/i18n/format';

/**
 * English formatting, kept as plain functions for code without a reader's language (tests, the data
 * build checks). Components use `useI18n().fmt`, which formats in the reader's language.
 */
const en = createFmt('en');

/** 1500 → "1500", 476 → "476 CE", -27 → "27 BCE" */
export const formatYear = (y: Year): string => en.year(y);

/** Compact range with the era written once where possible. Uses an en dash. */
export const formatRange = (from: Year, to: Year): string => en.range(from, to);

/** Axis label: shorter than formatYear, the era is implied by position. */
export function formatTick(y: Year): string {
  if (y < 0) return `${-y} BCE`;
  if (y === 0) return '0';
  return String(y);
}

export const formatShare = (share: number) => en.share(share);

/** 207000 → "207,000 km²" */
export const formatArea = (km2: number) => en.area(km2);

export const formatDuration = (from: Year, to: Year) => en.duration(from, to);

/** A span's years, with "c." when the source only gives them to the decade or century. */
export const formatSpanRange = (span: { from: Year; to: Year; approx?: boolean }): string => en.spanRange(span);

/** Share column: "62%", or "not mapped" for states whose territory is not mapped. */
export const formatSpanShare = (span: { peak?: number; extent?: string }) => en.spanShare(span);

/**
 * Wikidata [year, precision] as Wikidata itself displays it: 1873 (year or finer), "1600s" (decade),
 * "16th century" for +1600 at century precision (1501–1600), "2nd millennium" for millennia.
 */
export const formatWdTime = (t: [Year, number] | undefined): string => en.wdTime(t);

/** An event's date: "1066", "1337–1453", "1600s" when Wikidata gives only the decade. */
export const formatEventDate = (e: { year: Year; to?: Year; prec?: number }): string => en.eventDate(e);
