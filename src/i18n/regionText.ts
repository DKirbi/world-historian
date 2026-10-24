import type { I18n } from './i18n';

/** A region's words in the reader's language: its name, "All of…", "in…", the chart note and the source notes. */
export function regionText(i18n: I18n, id: string) {
  const key = (k: string) => `region.${id}.${k}`;
  return {
    label: i18n.tx(key('label'), id),
    all: i18n.tx(key('all'), id),
    in: i18n.tx(key('in'), id),
    chartNote: i18n.has(key('chartNote')) ? i18n.tx(key('chartNote'), '') : undefined,
    notes: i18n.all(key('note.')),
  };
}

export const groupName = (i18n: I18n, group: string) => i18n.tx(`group.${group}`, group);
