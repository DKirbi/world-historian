import { afterEach, describe, expect, it } from 'vitest';
import { assembleRegion } from '@/data/source';
import { files } from '@/data/bundles/europe';
import { createI18n } from '@/i18n/i18n';
import { capColumns, maxColumns, packLane } from '@/lib/pack';
import type { Span } from '@/data/types';
import { decodeHash, encodeHash, sameStory, type StoryRef } from '@/state/url';
import { buildStory } from '../templates';
import { headlineFromTitle, loadArticle, paragraphs, resolveTitle, setWikiFetch } from '../wiki';
import { setStoredFetch, storyKey } from '../stored';

const europe = assembleRegion('europe', (p) => files[`/data/${p}`]);
const en = { region: europe, i18n: createI18n('en') };
const sl = { region: europe, i18n: createI18n('sl') };
const nb = (s: string) => s.replace(/ /g, ' ');

describe('deep links', () => {
  const refs: StoryRef[] = [
    { kind: 'polity', id: 'habsburg-monarchy', lane: 'slovenia' },
    { kind: 'polity', id: 'roman-empire' },
    { kind: 'event', id: 'Q83224', lane: 'united-kingdom' },
    { kind: 'era', id: 'scandinavia-viking-age', lane: 'norway' },
    { kind: 'stack', lane: 'germany', from: 1250, to: 1300 },
    { kind: 'stack', lane: 'italy', from: -500, to: -264 },
  ];
  it('round-trips every kind of story', () => {
    for (const r of refs) expect(decodeHash(encodeHash('europe', r))).toEqual({ regionId: 'europe', story: r });
  });
  it('keeps the old bare region anchors', () => {
    expect(decodeHash('#americas')).toEqual({ regionId: 'americas', story: null });
    expect(encodeHash('asia', null)).toBe('#asia');
  });
  it('reads a readable address', () => {
    expect(encodeHash('europe', refs[0])).toBe('#europe/state/habsburg-monarchy/slovenia');
    expect(sameStory(refs[0], { kind: 'polity', id: 'habsburg-monarchy', lane: 'slovenia' })).toBe(true);
  });
  it('ignores what it cannot read', () => {
    expect(decodeHash('#europe/stack/germany/x/1300')).toEqual({ regionId: 'europe', story: null });
    expect(decodeHash('#europe/unknown/thing')).toEqual({ regionId: 'europe', story: null });
  });
});

describe('column cap', () => {
  const sp = (id: string, from: number, to: number, tier: 1 | 2 | 3 = 3, peak = 0.05): Span => ({ id, name: id, from, to, tier, peak });
  it('keeps every block at least 24 px wide', () => {
    expect(maxColumns(108)).toBe(4);
    expect(maxColumns(30)).toBe(2);
  });
  it('gathers the overflow of a crowded cluster into one block per run of years', () => {
    const spans = [sp('big', 1200, 1400, 1, 0.9), ...Array.from({ length: 6 }, (_, i) => sp(`s${i}`, 1250 + i, 1300 + i))];
    const { placed, stacks } = capColumns(packLane(spans), 3);
    expect(placed.every((p) => p.cols <= 3)).toBe(true);
    expect(placed.find((p) => p.span.id === 'big')?.col).toBe(0);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].spans.length + placed.length).toBe(7);
    expect(stacks[0].col).toBe(2);
  });
  it('leaves clusters that fit untouched', () => {
    const placed = packLane([sp('a', 1, 10), sp('b', 5, 15)]);
    expect(capColumns(placed, 4)).toEqual({ placed, stacks: [] });
  });
  it('draws a lone overflow span as itself', () => {
    // b and c overlap and need a third column; d is alone in its years
    const spans = [sp('a', 1, 100, 1, 0.9), sp('b', 1, 40, 2, 0.3), sp('c', 30, 35), sp('d', 60, 70)];
    const { placed, stacks } = capColumns(packLane(spans), 2);
    expect(stacks.map((s) => s.spans.map((x) => x.id))).toEqual([['b', 'c']]);
    expect(placed.map((p) => [p.span.id, p.col, p.cols])).toEqual([
      ['a', 0, 2],
      ['d', 1, 2],
    ]);
  });
});

describe('story templates', () => {
  it('tells a state from the country it was selected in', () => {
    const m = buildStory({ kind: 'polity', id: 'habsburg-monarchy', lane: 'slovenia' }, en);
    expect(m.found).toBe(true);
    expect(m.laneId).toBe('slovenia');
    expect(m.headline).toBe('Habsburg Monarchy');
    expect(m.dateline).toBe('Slovenia, 1516–1805');
    expect(m.dek[0].text).toBe('For 250 years, from 1556 to 1805, it held the whole of the land that is now Slovenia.');
    expect(m.article).toEqual({ enTitle: 'Habsburg monarchy', qid: 'Q66504140' });
    expect(m.related[0].items.length).toBeGreaterThan(3); // the same story, seen from its other countries
    expect(m.zoom).toEqual({ years: [1516, 1805], laneId: 'slovenia' });
  });
  it('cites every sentence it writes from the data', () => {
    const m = buildStory({ kind: 'polity', id: 'habsburg-monarchy', lane: 'slovenia' }, en);
    for (const s of m.dek) for (const c of s.cite ?? []) expect(m.sources[c]).toBeDefined();
    expect(m.sources[0].href).toContain('cliopatria');
  });
  it('writes the same story in Slovenian', () => {
    const m = buildStory({ kind: 'polity', id: 'habsburg-monarchy', lane: 'slovenia' }, sl);
    expect(m.kicker).toBe('Država');
    expect(m.dateline).toBe('Slovenija, 1516–1805');
    expect(nb(m.dek[0].text)).toBe('250 let, od 1556 do 1805, je bilo pod to oblastjo vse ozemlje, ki ga danes obsega Slovenija.');
    expect(m.dek[1].text).toMatch(/^Ta oblast je segala še v \d+ današnjih držav: /);
  });
  it('chooses the country with the largest share when none is given', () => {
    const m = buildStory({ kind: 'polity', id: 'roman-empire' }, en);
    expect(m.found).toBe(true);
    expect(europe.appearances['roman-empire'].some((a) => a.laneId === m.laneId)).toBe(true);
  });
  it('places an event and names who held the land then', () => {
    const m = buildStory({ kind: 'event', id: 'Q83224', lane: 'united-kingdom' }, en);
    expect(m.kicker).toBe('Battle');
    expect(m.dek[0].text).toBe('A battle fought in 1066 on land that is now United Kingdom.');
    expect(m.dek[1].text).toMatch(/^At the time, the chart shows .+ holding this land\.$/);
    expect(nb(buildStory({ kind: 'event', id: 'Q83224' }, sl).dek[0].text)).toBe(
      'Bitka, ki je potekala leta 1066 na ozemlju, ki ga danes obsega Združeno kraljestvo.',
    );
  });
  it('tells an era from its cited row, and reads its own article', () => {
    const m = buildStory({ kind: 'era', id: 'scandinavia-viking-age', lane: 'norway' }, en);
    expect(m.kicker).toBe('Era');
    expect(m.article).toEqual({ enTitle: 'Viking Age', section: undefined });
    expect(m.sources[0].href).toContain('oldid=');
    const croatia = buildStory({ kind: 'era', id: 'croatia-kingdom-of-croatia', lane: 'croatia' }, en);
    expect(croatia.article).toEqual({ enTitle: 'History of Croatia', sectionLike: 'Kingdom of Croatia (925–1102)' });
  });
  it('ends a sentence once when it closes on an abbreviated date', () => {
    expect(sl.i18n.t('story.era.lede', { page: 'X', from: '1000 pr. n. št.', to: '1 n. št.' })).toBe(
      'Po članku »X« v Wikipediji traja to obdobje od 1000 pr. n. št. do 1 n. št.',
    );
  });
  it('names a period bin in the reader’s language and reads no article for it', () => {
    const bin = europe.eras.find((e) => e.basis === 'period-bin' && e.name === 'Late Middle Ages')!;
    const m = buildStory({ kind: 'era', id: bin.id }, sl);
    expect(m.headline).toBe('Pozni srednji vek');
    expect(m.article).toBeNull();
  });
  it('lists the states gathered into a "+N" block, the largest first', () => {
    const m = buildStory({ kind: 'stack', lane: 'germany', from: 1250, to: 1300 }, en);
    expect(m.headline).toBe('Who held Germany');
    const items = m.related[0].items;
    expect(items.length).toBeGreaterThan(3);
    expect(m.dek[0].text).toContain(`${items.length} states`);
  });
  it('says so when an address points at nothing in the region', () => {
    expect(buildStory({ kind: 'polity', id: 'no-such-state' }, en).found).toBe(false);
    expect(buildStory({ kind: 'event', id: 'Q0' }, en).found).toBe(false);
  });
});

describe('Wikipedia text', () => {
  it('tidies what TextExtracts leaves of removed templates', () => {
    expect(paragraphs('Ljubljana ( ; German: Laibach) is the capital.\n\nIt lies ( listen) on the river.')).toEqual([
      'Ljubljana (German: Laibach) is the capital.',
      'It lies on the river.',
    ]);
    expect(paragraphs('A () b ,c.')).toEqual(['A b,c.']);
  });
  it('drops a title’s disambiguation from a headline', () => {
    expect(headlineFromTitle('Kranjska (vojvodina)')).toBe('Kranjska');
    expect(headlineFromTitle('Habsburška monarhija')).toBe('Habsburška monarhija');
  });
});

describe('Wikipedia requests', () => {
  it('serve a request shared by two callers to the second when the first cancels', async () => {
    // a fake network that honours an AbortSignal, as fetch does
    setWikiFetch(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          const body = { query: { pages: [{ title: 'Woodland period', langlinks: [{ lang: 'sl', title: 'Gozdno obdobje' }] }] } };
          setTimeout(() => resolve(new Response(JSON.stringify(body))), 5);
        }),
    );
    const first = new AbortController();
    const a = resolveTitle({ enTitle: 'Woodland period' }, 'sl', first.signal);
    // the story closed and reopened at once (or StrictMode undid and redid its first mount)
    first.abort();
    const b = resolveTitle({ enTitle: 'Woodland period' }, 'sl', new AbortController().signal);
    await expect(a).rejects.toThrow();
    await expect(b).resolves.toBe('Gozdno obdobje');
  });
});

describe('stored summaries', () => {
  const pack = (units: Record<string, unknown>) => new Response(JSON.stringify({ units }));
  const ueno = { title: 'Battle of Ueno', url: 'https://en.wikipedia.org/wiki/Battle_of_Ueno', rev: 1, paragraphs: ['Stored text.'] };
  const notStored = { title: 'Nowhere', url: 'https://en.wikipedia.org/wiki/Nowhere', rev: 1, paragraphs: ['Elsewhere.'] };
  const live = () => {
    const calls: string[] = [];
    setWikiFetch(async (url) => {
      calls.push(String(url));
      const body = { query: { pages: [{ title: 'Battle of Ueno', extract: 'Live text.', fullurl: 'https://en.wikipedia.org/wiki/Battle_of_Ueno' }] } };
      return new Response(JSON.stringify(body));
    });
    return calls;
  };
  afterEach(() => setStoredFetch(null));

  it('give English readers the stored text, with no request to Wikipedia', async () => {
    const calls = live();
    setStoredFetch(async (url) => (String(url).includes('/en/') ? pack({ 'Battle of Ueno': ueno }) : new Response('', { status: 404 })));
    const a = await loadArticle({ enTitle: 'Battle of Ueno' }, 'en', undefined, 'asia');
    expect(a?.paragraphs).toEqual(['Stored text.']);
    expect(a?.fallback).toBe(false);
    expect(calls).toEqual([]);
  });

  it('stand the stored English under a stored translation, with no request to Wikipedia', async () => {
    const calls = live();
    const translated = { paragraphs: ['Prevod.'], source: { wiki: 'en', title: 'Battle of Ueno', rev: 1, retrieved: '2026-10-01', paragraphs: [] } };
    setStoredFetch(async (url) => {
      const u = String(url);
      if (u.includes('/stories/en/')) return pack({ 'Battle of Ueno': ueno });
      if (u.endsWith('/translations/sl/asia.json')) return pack({ 'Battle of Ueno': translated });
      return new Response('', { status: 404 });
    });
    const a = await loadArticle({ enTitle: 'Battle of Ueno' }, 'sl', undefined, 'asia');
    expect(a?.paragraphs).toEqual(['Stored text.']);
    expect(a?.fallback).toBe(true);
    expect(calls).toEqual([]);
  });

  it('ask Wikipedia for an article the packs do not hold', async () => {
    const calls = live();
    setStoredFetch(async (url) => (String(url).includes('/en/') ? pack({ Nowhere: notStored }) : new Response('', { status: 404 })));
    const a = await loadArticle({ enTitle: 'Battle of Ueno' }, 'en', undefined, 'asia');
    expect(a?.paragraphs).toEqual(['Live text.']);
    expect(calls.length).toBe(1);
  });

  it('fall back to the stored English, marked unreachable, when the reader\'s Wikipedia cannot be reached', async () => {
    setWikiFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    setStoredFetch(async (url) => (String(url).includes('/stories/en/') ? pack({ 'Battle of Ueno': ueno }) : new Response('', { status: 404 })));
    const a = await loadArticle({ enTitle: 'Battle of Ueno' }, 'sl', undefined, 'asia');
    expect(a?.paragraphs).toEqual(['Stored text.']);
    expect(a?.fallback).toBe(true);
    expect(a?.unreachable).toBe(true);
  });

  it('prefer the reader-language pack once that language is snapshotted', async () => {
    live();
    const own = { ...ueno, title: 'Bitka pri Uenu', paragraphs: ['Shranjeno besedilo.'] };
    setStoredFetch(async (url) => pack(String(url).includes('/sl/') ? { 'Battle of Ueno': own } : { 'Battle of Ueno': ueno }));
    const a = await loadArticle({ enTitle: 'Battle of Ueno' }, 'sl', undefined, 'asia');
    expect(a?.paragraphs).toEqual(['Shranjeno besedilo.']);
    expect(a?.fallback).toBe(false);
  });

  it('key sections by title and heading, or by the cited row', () => {
    expect(storyKey({ enTitle: 'Terra Mariana', section: 'Livonian Confederation' })).toBe('Terra Mariana#Livonian Confederation');
    expect(storyKey({ enTitle: 'History of Japan', sectionLike: 'Edo period (1600–1868)' })).toBe('History of Japan#Edo period (1600–1868)');
    expect(storyKey({ qid: 'Q1' })).toBeUndefined();
  });
});
