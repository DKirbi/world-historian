import type { Era, HistEvent, RegionData, Span, Year } from '@/data/types';
import type { I18n } from '@/i18n/i18n';
import { spansAt } from '@/lib/spans';
import type { StoryRef } from '@/state/url';
import type { ArticleRef } from './wiki';

/**
 * Story templates: one pure function per kind of record, from the chart's data to a story model.
 * The model is what the drawer prints (and what the phone view reduces to a link). The Wikipedia
 * summary is joined in at render time, so a template never waits on the network and is unit-tested
 * like the rest of the chart's logic.
 *
 * Every sentence a template writes is a localized message filled with the record's own data, and
 * cites the source it comes from. Nothing is invented: if the data does not say it, the story does not.
 */

export interface Sentence {
  text: string;
  /** Indexes into the model's `sources` (0-based); printed as [n] after the sentence. */
  cite?: number[];
}

export interface Fact {
  label: string;
  value: string;
}

export interface StoryLink {
  ref: StoryRef;
  name: string;
  meta?: string;
  /** Language of `name` when it is not the reader's (an untranslated English name). */
  lang?: string;
}

export interface RelatedGroup {
  heading: string;
  items: StoryLink[];
}

export interface SourceItem {
  text: string;
  href?: string;
  /** Language of the text, when it is a quotation in another language. */
  lang?: string;
}

export type StoryKind = StoryRef['kind'];

export interface StoryModel {
  ref: StoryRef;
  /** Stable identity of the story, for transitions and focus. */
  key: string;
  kind: StoryKind;
  /** The record found in the data; false when an address points at something this region lacks. */
  found: boolean;
  kicker: string;
  headline: string;
  headlineLang: string;
  /** Place and time, as a newspaper dateline. */
  dateline: string;
  dek: Sentence[];
  facts: Fact[];
  /** What to summarise from Wikipedia; null when the story is told from the data alone. */
  article: ArticleRef | null;
  sources: SourceItem[];
  related: RelatedGroup[];
  /** Years and column the "Show on the chart" action goes to. */
  zoom: { years: [Year, Year]; laneId?: string } | null;
  /** Column the story is told from; kept in view beside the drawer. */
  laneId?: string;
}

export interface StoryCtx {
  region: RegionData;
  i18n: I18n;
}

const CLIOPATRIA = 'https://github.com/Seshat-Global-History-Databank/cliopatria';
const wikidataUrl = (id: string) => `https://www.wikidata.org/wiki/${id}`;

export function buildStory(ref: StoryRef, ctx: StoryCtx): StoryModel {
  switch (ref.kind) {
    case 'polity':
      return polityStory(ref, ctx);
    case 'event':
      return eventStory(ref, ctx);
    case 'era':
      return eraStory(ref, ctx);
    case 'stack':
      return stackStory(ref, ctx);
  }
}

/* ---------- shared helpers ---------- */

function helpers({ region, i18n }: StoryCtx) {
  const laneById = new Map(region.lanes.map((l) => [l.id, l]));
  const laneName = (id: string) => {
    const l = laneById.get(id);
    return l ? i18n.lane(l) : id;
  };
  const polityName = (id: string, fallback?: string) => {
    const p = region.polities[id];
    return i18n.polity(p ?? { id, name: fallback ?? id.replace(/-/g, ' ') });
  };
  const polityLang = (id: string) => (i18n.nameLang('polity', id) === i18n.meta.tag ? undefined : 'en');
  const eventName = (e: HistEvent) => i18n.event(e);
  return { laneById, laneName, polityName, polityLang, eventName };
}

const rank = (a: Span, b: Span) => a.tier - b.tier || (b.peak ?? -1) - (a.peak ?? -1) || b.to - b.from - (a.to - a.from);
const overlaps = (a: { from: Year; to: Year }, from: Year, to: Year) => a.from <= to && from <= a.to;

function notFound(ref: StoryRef, ctx: StoryCtx): StoryModel {
  const { i18n } = ctx;
  return {
    ref,
    key: JSON.stringify(ref),
    kind: ref.kind,
    found: false,
    kicker: '',
    headline: i18n.t('record.notInRegion'),
    headlineLang: i18n.meta.tag,
    dateline: '',
    dek: [],
    facts: [],
    article: null,
    sources: [],
    related: [],
    zoom: null,
  };
}

/* ---------- a state (or a culture, or an unmapped state) ---------- */

function polityStory(ref: Extract<StoryRef, { kind: 'polity' }>, ctx: StoryCtx): StoryModel {
  const { region, i18n } = ctx;
  const { t, fmt } = i18n;
  const h = helpers(ctx);
  const polity = region.polities[ref.id];
  const apps = region.appearances[ref.id] ?? [];
  if (!polity || !apps.length) return notFound(ref, ctx);

  const laneId = ref.lane && apps.some((a) => a.laneId === ref.lane) ? ref.lane : [...apps].sort((a, b) => rank(a.span, b.span))[0].laneId;
  const here = apps.filter((a) => a.laneId === laneId).map((a) => a.span).sort((a, b) => a.from - b.from);
  const main = [...here].sort(rank)[0];
  const lane = h.laneName(laneId);
  const unmapped = main.extent === 'unknown';
  const culture = main.kind === 'culture' || Boolean(polity.culture);

  const sources: SourceItem[] = [];
  const wdId = polity.wd?.id ?? (polity.wd ? undefined : polity.wikidata);
  let mapSource = -1;
  if (!unmapped) {
    mapSource = sources.push({ text: t('story.cite.cliopatria'), href: CLIOPATRIA }) - 1;
  }
  const wdSource = wdId ? sources.push({ text: t('story.cite.wikidata', { id: wdId }), href: wikidataUrl(wdId) }) - 1 : -1;
  const dataCite = (mapSource >= 0 ? [mapSource] : wdSource >= 0 ? [wdSource] : undefined) as number[] | undefined;

  const from = fmt.year(main.from);
  const to = fmt.year(main.to);
  const share = main.peak !== undefined ? fmt.share(main.peak) : '';
  const dek: Sentence[] = [];
  if (culture) {
    dek.push({ text: t('story.polity.ledeCulture', { range: fmt.spanRange(main), lane }), cite: dataCite });
  } else if (unmapped) {
    const source = t(main.cited === 'wikipedia' ? 'story.source.wikipedia' : 'story.source.wikidata');
    dek.push({ text: t('story.polity.ledeUnmapped', { from, to, source, lane }), cite: dataCite });
  } else if (main.inside) {
    dek.push({ text: t('story.polity.ledeInside', { from, to, share, lane }), cite: dataCite });
  } else if (main.large && (main.peak ?? 0) < 0.2) {
    dek.push({ text: t('story.polity.ledeLarge', { from, to, share, lane, area: fmt.area(main.km2 ?? 0) }), cite: dataCite });
  } else if (!main.realm && (main.peak ?? 0) >= 0.995) {
    dek.push({ text: t('story.polity.ledeAll', { duration: fmt.duration(main.from, main.to), from, to, lane }), cite: dataCite });
  } else {
    const key = main.realm ? 'story.polity.ledeRealm' : 'story.polity.lede';
    dek.push({ text: t(key, { duration: fmt.duration(main.from, main.to), from, to, share, lane }), cite: dataCite });
  }

  // its reach beyond this column, largest shares first
  const bestIn = new Map<string, Span>();
  for (const a of apps) {
    const cur = bestIn.get(a.laneId);
    if (!cur || rank(a.span, cur) < 0) bestIn.set(a.laneId, a.span);
  }
  const others = [...bestIn.entries()].filter(([l]) => l !== laneId).sort((a, b) => rank(a[1], b[1]));
  if (others.length) {
    const names = others.map(([l]) => h.laneName(l));
    const list =
      names.length > 4 ? fmt.list([...names.slice(0, 3), t('story.polity.reachMore', { n: names.length - 3 })]) : fmt.list(names);
    dek.push({ text: t('story.polity.reach', { lane, n: others.length, list }), cite: dataCite });
  }

  const facts: Fact[] = [{ label: t('story.fact.yearsHere', { lane }), value: here.map((s) => fmt.spanRange(s)).join(', ') }];
  if (main.peak !== undefined) facts.push({ label: t('story.fact.share', { lane }), value: fmt.share(Math.max(...here.map((s) => s.peak ?? 0))) });
  if (main.km2) facts.push({ label: t('story.fact.area'), value: fmt.area(Math.max(...here.map((s) => s.km2 ?? 0))) });
  facts.push({ label: t('story.fact.countries'), value: fmt.number(bestIn.size) });
  if (polity.wd?.start || polity.wd?.end)
    facts.push({ label: t('story.fact.wikidata'), value: `${fmt.wdTime(polity.wd.start)} – ${polity.wd.end ? fmt.wdTime(polity.wd.end) : t('record.today')}` });

  // other points of view: the same state from its other countries, and who came before, beside and after it here
  const laneSpans = region.spansByLane[laneId] ?? [];
  const link = (s: Span): StoryLink => ({
    ref: { kind: 'polity', id: s.id, lane: laneId },
    name: h.polityName(s.id, s.name),
    meta: fmt.spanRange(s),
    lang: h.polityLang(s.id),
  });
  const before = laneSpans.filter((s) => s.id !== ref.id && s.to < main.from && s.to >= main.from - 30).sort(rank).slice(0, 2);
  const after = laneSpans.filter((s) => s.id !== ref.id && s.from > main.to && s.from <= main.to + 30).sort(rank).slice(0, 2);
  const beside = laneSpans
    .filter((s) => s.id !== ref.id && s.tier <= 2 && overlaps(s, main.from, main.to))
    .sort(rank)
    .slice(0, 3);
  const related: RelatedGroup[] = [];
  if (others.length)
    related.push({
      heading: t('story.related.otherCountries'),
      items: others.slice(0, 8).map(([l, s]) => ({
        ref: { kind: 'polity', id: ref.id, lane: l },
        name: h.laneName(l),
        meta: `${fmt.spanRange(s)}${s.peak !== undefined ? `, ${fmt.share(s.peak)}` : ''}`,
      })),
    });
  if (before.length) related.push({ heading: t('story.related.before', { lane }), items: before.map(link) });
  if (beside.length) related.push({ heading: t('story.related.sameTime', { lane }), items: beside.map(link) });
  if (after.length) related.push({ heading: t('story.related.after', { lane }), items: after.map(link) });

  return {
    ref,
    key: `polity:${ref.id}:${laneId}`,
    kind: 'polity',
    found: true,
    kicker: t(culture ? 'story.kind.culture' : unmapped ? 'story.kind.unmapped' : 'story.kind.state'),
    headline: h.polityName(ref.id),
    headlineLang: i18n.nameLang('polity', ref.id),
    dateline: t('story.dateline', { place: lane, when: fmt.spanRange({ from: here[0].from, to: here[here.length - 1].to, approx: main.approx }) }),
    dek,
    facts,
    article: polity.wikipedia || wdId
      ? { enTitle: polity.wikipedia, section: polity.wikipediaSection, qid: polity.linkFix ? undefined : wdId }
      : null,
    sources,
    related,
    zoom: { years: [here[0].from, here[here.length - 1].to], laneId },
    laneId,
  };
}

/* ---------- a key event ---------- */

const EVENT_PAD = (e: HistEvent) => Math.max(10, Math.round(((e.to ?? e.year) - e.year) * 0.3));

function eventStory(ref: Extract<StoryRef, { kind: 'event' }>, ctx: StoryCtx): StoryModel {
  const { region, i18n } = ctx;
  const { t, fmt } = i18n;
  const h = helpers(ctx);
  const entry = region.events[ref.id];
  if (!entry) return notFound(ref, ctx);
  const { event: e, laneIds } = entry;
  const laneId = ref.lane && laneIds.includes(ref.lane) ? ref.lane : laneIds[0];
  const lane = h.laneName(laneId);
  const places = fmt.list(laneIds.map(h.laneName));

  const sources: SourceItem[] = [{ text: t('story.cite.wikidataEvent', { id: e.id }), href: wikidataUrl(e.id) }];
  const rulers = spansAt(region.spansByLane[laneId] ?? [], e.year);
  const mapSource = rulers.some((s) => s.extent !== 'unknown')
    ? sources.push({ text: t('story.cite.cliopatria'), href: CLIOPATRIA }) - 1
    : -1;

  const dek: Sentence[] = [
    { text: t(`story.event.lede.${e.type}` as Parameters<typeof t>[0], { when: fmt.when(e), place: places }), cite: [0] },
  ];
  // The chart knows who held the land in that year, and each one's largest share over its whole span,
  // not its share in that very year: so the story names them, most dominant first, without "most of".
  if (rulers.length)
    dek.push({
      text: t('story.event.rulers', { list: fmt.list(rulers.slice(0, 3).map((s) => h.polityName(s.id, s.name))) }),
      cite: mapSource >= 0 ? [mapSource] : undefined,
    });
  else dek.push({ text: t('story.event.noRuler') });

  const year = fmt.year(e.year);
  const related: RelatedGroup[] = [];
  if (rulers.length)
    related.push({
      heading: t('story.related.rulers', { lane, year }),
      items: rulers.slice(0, 4).map((s) => ({
        ref: { kind: 'polity', id: s.id, lane: laneId },
        name: h.polityName(s.id, s.name),
        meta: fmt.spanShare(s),
        lang: h.polityLang(s.id),
      })),
    });
  const nearby = (region.eventsByLane[laneId] ?? [])
    .filter((x) => x.id !== e.id && Math.abs(x.year - e.year) <= 30)
    .sort((a, b) => b.links - a.links)
    .slice(0, 4)
    .sort((a, b) => a.year - b.year);
  if (nearby.length)
    related.push({
      heading: t('story.related.nearby', { lane, year }),
      items: nearby.map((x) => ({
        ref: { kind: 'event', id: x.id, lane: laneId },
        name: h.eventName(x),
        meta: fmt.eventDate(x),
        lang: i18n.nameLang('event', x.id) === i18n.meta.tag ? undefined : 'en',
      })),
    });
  if (laneIds.length > 1)
    related.push({
      heading: t('story.related.otherCountries'),
      items: laneIds.filter((l) => l !== laneId).map((l) => ({ ref: { kind: 'event', id: e.id, lane: l }, name: h.laneName(l) })),
    });

  const pad = EVENT_PAD(e);
  return {
    ref,
    key: `event:${e.id}:${laneId}`,
    kind: 'event',
    found: true,
    kicker: t(`event.${e.type}` as Parameters<typeof t>[0]),
    headline: h.eventName(e),
    headlineLang: i18n.nameLang('event', e.id),
    dateline: t('story.dateline', { place: lane, when: fmt.eventDate(e) }),
    dek,
    facts: [
      { label: t('story.fact.date'), value: fmt.eventDate(e) },
      { label: t('story.fact.type'), value: t(`event.${e.type}` as Parameters<typeof t>[0]) },
      { label: t('story.fact.place'), value: places },
      { label: t('story.fact.known'), value: t('story.fact.knownValue', { n: e.links }) },
    ],
    // L10N-LATER: an event linked by Wikidata alone (no e.wiki) has no worklist entry and no translation
    // ("wikidata-only" in data/translations/<lang>/_later.json).
    article: { enTitle: e.wiki, section: e.wikiSection, qid: e.id },
    sources,
    related,
    zoom: { years: [e.year - pad, (e.to ?? e.year) + pad], laneId },
    laneId,
  };
}

/* ---------- an era ---------- */

/** Localized name of an era: a period bin's own label, an area's period by its English name. */
export function eraName(era: Era, region: RegionData, i18n: I18n): string {
  if (era.basis === 'period-bin') {
    const p = region.periods.find((x) => x.label === era.name);
    if (p) return i18n.tx(`period.${region.id}.${p.id}`, era.name);
  }
  return i18n.era(era);
}

export function areaName(era: Era, region: RegionData, i18n: I18n): string {
  const area = region.eraAreas[era.area];
  if (area?.group) return i18n.tx(`group.${area.group}`, area.group);
  return i18n.tx(`area.${era.area}`, area?.label ?? era.area);
}

function eraStory(ref: Extract<StoryRef, { kind: 'era' }>, ctx: StoryCtx): StoryModel {
  const { region, i18n } = ctx;
  const { t, fmt } = i18n;
  const h = helpers(ctx);
  const era = region.eras.find((x) => x.id === ref.id);
  if (!era) return notFound(ref, ctx);
  const laneId = ref.lane && era.lanes.includes(ref.lane) ? ref.lane : era.lanes[0];
  const bins = era.basis === 'period-bin';
  const name = eraName(era, region, i18n);
  const area = areaName(era, region, i18n);

  const sources: SourceItem[] = [];
  const rowSource = era.cite
    ? sources.push({ text: t('story.cite.row', { page: era.cite.page, quote: era.cite.quote }), href: era.cite.permalink, lang: i18n.locale === 'en' ? undefined : 'en' }) - 1
    : -1;
  for (const o of era.periodo ?? [])
    sources.push({
      text: t('story.cite.periodo', { label: o.label, range: o.from !== null && o.to !== null ? fmt.range(o.from, o.to) : '', source: o.source }),
      href: o.url,
    });

  const from = fmt.year(era.from);
  const to = fmt.year(era.to);
  const dek: Sentence[] = [
    bins
      ? { text: t('story.era.ledeBins', { from, to }) }
      : { text: t('story.era.lede', { page: era.cite?.page ?? '', from, to }), cite: rowSource >= 0 ? [rowSource] : undefined },
  ];
  const leaders = era.leaders.map((l) => h.polityName(l.id, l.name));
  if (leaders.length)
    dek.push({
      text: t(era.leadersBy === 'source' ? 'story.era.named' : 'story.era.leading', { list: fmt.list(leaders) }),
      cite: era.leadersBy === 'source' && rowSource >= 0 ? [rowSource] : undefined,
    });
  if (era.clippedFrom !== undefined) dek.push({ text: t('story.era.clipped', { year: fmt.year(era.clippedFrom) }) });

  const sameArea = region.eras.filter((x) => x.area === era.area && x.lanes.includes(laneId)).sort((a, b) => a.from - b.from);
  const i = sameArea.findIndex((x) => x.id === era.id);
  const eraLink = (x: Era): StoryLink => ({ ref: { kind: 'era', id: x.id, lane: laneId }, name: eraName(x, region, i18n), meta: fmt.spanRange(x) });
  const related: RelatedGroup[] = [];
  if (era.leaders.length)
    related.push({
      heading: t('story.related.leaders'),
      items: era.leaders.map((l) => {
        const apps = region.appearances[l.id] ?? [];
        const lane = apps.some((a) => a.laneId === laneId) ? laneId : apps.find((a) => era.lanes.includes(a.laneId))?.laneId;
        const spans = apps.filter((a) => a.laneId === lane).map((a) => a.span);
        return {
          ref: { kind: 'polity', id: l.id, lane },
          name: h.polityName(l.id, l.name),
          meta: spans.length ? fmt.spanRange({ from: Math.min(...spans.map((s) => s.from)), to: Math.max(...spans.map((s) => s.to)) }) : undefined,
          lang: h.polityLang(l.id),
        };
      }),
    });
  if (i > 0) related.push({ heading: t('story.related.prevEra'), items: [eraLink(sameArea[i - 1])] });
  if (i >= 0 && i < sameArea.length - 1) related.push({ heading: t('story.related.nextEra'), items: [eraLink(sameArea[i + 1])] });

  let article: ArticleRef | null = null;
  if (era.article) article = { enTitle: era.article.title, section: era.article.section };
  else if (era.cite && !bins) article = { enTitle: era.cite.page, sectionLike: era.cite.quote };

  return {
    ref,
    key: `era:${era.id}:${laneId}`,
    kind: 'era',
    found: true,
    kicker: t('story.kind.era'),
    headline: name,
    headlineLang: bins ? i18n.meta.tag : i18n.nameLang('era', era.id),
    dateline: t('story.dateline', { place: area, when: fmt.spanRange(era) }),
    dek,
    facts: [
      { label: t('story.fact.years'), value: fmt.spanRange(era) },
      { label: t('story.fact.columns'), value: fmt.list(era.lanes.map(h.laneName)) },
      { label: t('story.fact.basis'), value: t(bins ? 'story.fact.basisBins' : 'story.fact.basisCited') },
    ],
    article,
    sources,
    related,
    zoom: { years: [era.from, era.to], laneId },
    laneId,
  };
}

/* ---------- several small states, gathered into one "+N" block ---------- */

function stackStory(ref: Extract<StoryRef, { kind: 'stack' }>, ctx: StoryCtx): StoryModel {
  const { region, i18n } = ctx;
  const { t, fmt } = i18n;
  const h = helpers(ctx);
  if (!region.lanes.some((l) => l.id === ref.lane)) return notFound(ref, ctx);
  const lane = h.laneName(ref.lane);
  const spans = (region.spansByLane[ref.lane] ?? []).filter((s) => overlaps(s, ref.from, ref.to)).sort(rank);
  const from = fmt.year(ref.from);
  const to = fmt.year(ref.to);
  const sources: SourceItem[] = [{ text: t('story.cite.cliopatria'), href: CLIOPATRIA }];
  return {
    ref,
    key: `stack:${ref.lane}:${ref.from}:${ref.to}`,
    kind: 'stack',
    found: true,
    kicker: t('story.kind.stack'),
    headline: t('story.stack.headline', { lane }),
    headlineLang: i18n.meta.tag,
    dateline: t('story.dateline', { place: lane, when: fmt.range(ref.from, ref.to) }),
    dek: [{ text: t('story.stack.lede', { n: spans.length, lane, from, to }), cite: [0] }],
    facts: [
      { label: t('story.fact.years'), value: fmt.range(ref.from, ref.to) },
      { label: t('story.fact.states'), value: fmt.number(spans.length) },
    ],
    article: null,
    sources,
    related: [
      {
        heading: t('story.related.listed'),
        items: spans.map((s) => ({
          ref: { kind: 'polity', id: s.id, lane: ref.lane },
          name: h.polityName(s.id, s.name),
          meta: `${fmt.spanRange(s)}, ${fmt.spanShare(s)}`,
          lang: h.polityLang(s.id),
        })),
      },
    ],
    zoom: { years: [ref.from, ref.to], laneId: ref.lane },
    laneId: ref.lane,
  };
}
