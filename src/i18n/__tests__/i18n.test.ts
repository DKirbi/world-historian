import { describe, expect, it } from 'vitest';
import { IntlMessageFormat } from 'intl-messageformat';
import en from '../messages/en.json';
import sl from '../messages/sl.json';
import slNames from '../names/sl.json';
import { createFmt } from '../format';
import { createI18n } from '../i18n';
import { LOCALES } from '../locales';
import { REGIONS } from '@/data/regions';

const CATALOGUES: Record<string, Record<string, string>> = { en, sl };

/** Placeholder names of an ICU message, so every translation fills the same values. */
function argNames(message: string): string[] {
  const names = new Set<string>();
  const walk = (els: ReturnType<IntlMessageFormat['getAst']>) => {
    for (const el of els as Array<{ type: number; value?: string; options?: Record<string, { value: unknown }>; children?: unknown }>) {
      if (el.type !== 0 && el.type !== 7 && el.value) names.add(el.value); // 0 literal, 7 pound
      if (el.options) for (const o of Object.values(el.options)) walk(o.value as never);
      if (Array.isArray(el.children)) walk(el.children as never);
    }
  };
  walk(new IntlMessageFormat(message, 'en').getAst());
  return [...names].sort();
}

describe('message catalogues', () => {
  it('every locale has exactly the English keys', () => {
    for (const { id } of LOCALES) expect(Object.keys(CATALOGUES[id]).sort()).toEqual(Object.keys(en).sort());
  });
  it('every message parses and uses the same placeholders as English', () => {
    for (const { id, tag } of LOCALES)
      for (const [key, message] of Object.entries(CATALOGUES[id])) {
        expect(() => new IntlMessageFormat(message, tag), `${id} ${key}`).not.toThrow();
        // a translation may drop a placeholder its grammar does not need (the lane in a heading), never add one
        const extra = argNames(message).filter((a) => !argNames((en as Record<string, string>)[key]).includes(a));
        expect(extra, `${id} ${key}`).toEqual([]);
      }
  });
  it('names every region, period, area and group the data uses', () => {
    for (const r of REGIONS) expect(en).toHaveProperty(`region.${r.id}.label`);
  });
  it('never gives two different states one Slovenian name', () => {
    const polities = (slNames as { polities?: Record<string, string> }).polities ?? {};
    const english = new Map<string, Set<string>>();
    for (const r of REGIONS) {
      const file = import.meta.glob('/data/*/_polities.json', { eager: true, import: 'default' })[`/data/${r.id}/_polities.json`] as {
        polities: Array<{ id: string; name: string }>;
      };
      for (const p of file.polities) {
        const sl = polities[p.id];
        if (sl) (english.get(sl) ?? english.set(sl, new Set()).get(sl)!).add(p.name);
      }
    }
    expect([...english.entries()].filter(([, names]) => names.size > 1)).toEqual([]);
    expect(polities['habsburg-monarchy']).toBe('Habsburška monarhija');
  });
  it('has a Slovenian name for every country column', () => {
    expect(Object.keys(slNames.lanes).length).toBeGreaterThanOrEqual(190);
    expect(slNames.lanes.slovenia).toBe('Slovenija');
    expect(slNames.lanes['united-kingdom']).toBe('Združeno kraljestvo');
  });
});

describe('formatting', () => {
  const enF = createFmt('en');
  const slF = createFmt('sl');
  const nb = (s: string) => s.replace(/ /g, ' ');
  it('keeps the English notation of the chart', () => {
    expect(enF.year(-27)).toBe('27 BCE');
    expect(enF.year(476)).toBe('476 CE');
    expect(enF.range(-300, -200)).toBe('300–200 BCE');
    expect(enF.range(-27, 14)).toBe('27 BCE – 14 CE');
    expect(enF.share(0.62)).toBe('62%');
    expect(enF.area(207000)).toBe('207,000 km²');
    expect(enF.duration(1278, 1918)).toBe('641 years');
  });
  it('writes Slovenian years, shares and plurals', () => {
    expect(nb(slF.year(-27))).toBe('27 pr. n. št.');
    expect(nb(slF.year(476))).toBe('476 n. št.');
    expect(nb(slF.range(-300, -200))).toBe('300–200 pr. n. št.');
    expect(nb(slF.share(0.62))).toBe('62 %');
    expect(nb(slF.area(207000))).toBe('207.000 km²');
    expect([1, 2, 3, 5, 101, 102].map((n) => slF.duration(1, n))).toEqual(['1 leto', '2 leti', '3 leta', '5 let', '101 leto', '102 leti']);
    expect(nb(slF.wdTime([1600, 7]))).toBe('16. stoletje');
    expect(nb(slF.wdTime([1620, 8]))).toBe('1620. leta');
    expect(slF.list(['A', 'B', 'C'])).toBe('A, B in C');
  });
  it('writes time phrases for running text', () => {
    expect(enF.when({ year: 1066 })).toBe('in 1066');
    expect(enF.when({ year: 1337, to: 1453 })).toBe('from 1337 to 1453');
    expect(enF.when({ year: 1620, prec: 8 })).toBe('in the 1620s');
    expect(nb(slF.when({ year: 1066 }))).toBe('leta 1066');
    expect(nb(slF.when({ year: 1337, to: 1453 }))).toBe('med letoma 1337 in 1453');
    expect(nb(slF.when({ year: -499, to: -449 }))).toBe('med letoma 499 in 449 pr. n. št.');
    expect(nb(slF.when({ year: 1620, prec: 8 }))).toBe('v 1620. letih');
    expect(nb(slF.when({ year: 1200, prec: 7 }))).toBe('okoli leta 1200');
  });
  it('never breaks a line inside a Slovenian era abbreviation', () => {
    expect(slF.year(-27)).toBe('27 pr. n. št.');
  });
});

describe('translator', () => {
  it('formats plurals by the language’s own rules', () => {
    const t = createI18n('sl').t;
    expect(t('countries.count', { n: 1 })).toBe('1 država');
    expect(t('countries.count', { n: 2 })).toBe('2 državi');
    expect(t('countries.count', { n: 4 })).toBe('4 države');
    expect(t('countries.count', { n: 5 })).toBe('5 držav');
    expect(createI18n('en').t('countries.count', { n: 1 })).toBe('1 country');
  });
  it('names columns, and falls back to the data’s name', () => {
    const i = createI18n('sl');
    expect(i.lane({ id: 'slovenia', label: 'Slovenia' })).toBe('Slovenija');
    expect(i.lane({ id: 'nowhere', label: 'Nowhere' })).toBe('Nowhere');
    expect(createI18n('en').lane({ id: 'slovenia', label: 'Slovenia' })).toBe('Slovenia');
  });
  it('lists numbered notes in order', () => {
    expect(createI18n('en').all('region.europe.note.')).toHaveLength(2);
  });
  it('quotes in each language’s own marks', () => {
    expect(createI18n('en').quote('x')).toBe('“x”');
    expect(createI18n('sl').quote('x')).toBe('»x«');
  });
});
