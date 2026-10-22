# Pattern: story drawer

Selecting anything on the chart — a state, an era, an event, a "+N" block, a column head's ruler — opens its **story**: a short newspaper article on the right that tells the record from the chart's data, summarises its Wikipedia article and cites both. Selecting something else changes the story.

## Selection model

**One story at a time.** The story is the selection; there is no separate highlight state.

| Action | Result |
|---|---|
| Select a block, event, era, "+N" or ruler | Opens its story, told from **that column** (`lane`). Replaces any open story. Pushes a history entry. |
| Select a "point of view" inside a story | Opens that story (another country, an earlier or later state, a related event) |
| Double-click an era or empire block | Zooms one level deeper (the old single-click behaviour) |
| Esc, ✕, or browser Back | Closes the story; the trace and dimming go with it |
| Search a state or event | Opens its story and zooms to its years |

While a story is open, the chart shows it:

- the followed state is painted in the selection colour (`--sel`) **in every country**;
- the story's column is framed in ink and its header marked;
- other columns fade to `--dim` (about 40 %), except the followed state's blocks;
- the column is panned into the part of the chart the drawer leaves uncovered — when the story opens, when the drawer is resized, and after a zoom from search or a link lands. After that the reader is free to pan away.

### Deep links

`#<region>/<kind>/<id>[/<column>]`, for example `#europe/state/habsburg-monarchy/slovenia`, `#europe/event/Q83224/united-kingdom`, `#americas/era/andes-early-horizon/peru`, `#europe/stack/germany/1250/1300`. A bare `#europe` still opens a region. A link opens on the story's years. `?lang=sl` sets the language.

## Anatomy (desktop, ≥ 720 px)

```
┌ toolbar ─────────────────────────────── [⤢] [✕] ┐
│ ◎ Show on the chart                              │
├──────────────────────────────────────────────────┤
│ ════════════════════  Oxford rule (3 px + 1 px)  │
│ State                                kicker      │
│ Habsburg Monarchy                    headline    │
│ SLOVENIA, 1516–1805. For 250 years…[2]  standfirst, opened by the dateline │
│ ┌──────────────────────────────┐                 │
│ │  lead image, greyscale +     │  figure         │
│ │  halftone screen             │                 │
│ └──────────────────────────────┘                 │
│ Test engraver; Public domain; via Commons        │
│ T͟he Habsburg monarchy is…  (drop cap) [1]  summary │
│ Continue reading on Wikipedia ↗                  │
│ ─ At a glance ─  facts (data face)               │
│ The same story, seen from  ·  Before it, in …    │  points of view
│ Sources  1. Wikipedia rev…  2. Cliopatria  3. Wikidata │
│ ▸ Behind the record   (provenance, collapsed)    │
└──────────────────────────────────────────────────┘
```

At full width the article becomes a page: the summary sets in two newspaper columns, and facts and points of view move into a sticky sidebar.

**Type** ([research](../research/typography.md)): Roboto Slab for the headline (700, 600 at full width), the drop cap and the labels — kicker, dateline and section heads in tracked capitals; Literata for the standfirst, the summary and the points of view; the chart's condensed sans for facts, captions and provenance. No italic labels.

| Part | Content | Source |
|---|---|---|
| Kicker | Kind: State / State, borders not mapped / Archaeological culture / Era / Battle… / Several states | template |
| Headline | Name in the reader's language: names snapshot, else the title of the reader's Wikipedia article, else the data's English name (marked `lang="en"`) | data + Wikipedia |
| Dateline | Column and years, small caps | data |
| Standfirst | One to three sentences written from the data, each with its citation | template + data |
| Figure | Article's lead image, greyscale, with author and licence from Commons | Wikipedia, Commons |
| Summary | Intro of the article (or the section, for eras that are a heading of a "History of …" article): up to 3 paragraphs / 1,100 characters at the side, 5 / 2,200 at full width | Wikipedia |
| Facts | Years in the column, largest share, area, countries of today, Wikidata dates (state); date, type, place, editions (event); years, columns, dating basis (era) | data |
| Points of view | Same state from its other countries; before / at the same time / after in this column; who held the land at the event; neighbouring periods | data |
| Sources | Numbered, in citation order. [1] is always the Wikipedia article (revision link) when there is one | all |
| Behind the record | The data build's provenance: share table, how an unmapped state or culture was dated and placed, the Wikidata link check, review flags | data |

## Behaviour

- **Non-modal.** The drawer covers part of the chart without resizing it; the chart behind stays interactive so another block can be selected.
- **Resize** by dragging the left edge, or with ← / → (32 px), Home and End on the focused edge. Width is remembered. The chart keeps at least 240 px.
- **Full width** from the toolbar or by double-clicking the edge; "Back to the side view" returns.
- **Focus** moves to the headline when a story opens (no ring: it is not a control). Esc inside the drawer closes it.
- **Motion**: the drawer slides in 200 ms; column fades take 160 ms; both respect reduced motion.

## States of the summary

| State | Shown |
|---|---|
| Loading | "Fetching the article from Wikipedia…" over three grey type lines |
| Ready | Summary paragraphs, drop cap, [1] at the end |
| Reader's language has no article | English summary with `lang="en"` and a note saying so |
| No article linked (or a list of "+N") | A note that the story is told from the data (none for "+N") |
| Offline / error | "Wikipedia could not be reached…" with **Try again**; the data story stays |

## Phones (< 720 px)

For now a phone shows a compact card instead of the drawer: kicker, headline, dateline and **Read on Wikipedia** (the article in the reader's language, else English). The full drawer comes to phones later; the same story model will drive it.

## Templates

`src/features/story/templates.ts` holds one pure function per kind — `polity`, `event`, `era`, `stack` — from a `StoryRef` and the region's data to a `StoryModel` (kicker, headline, dateline, standfirst sentences with citation indexes, facts, related groups, sources, article reference, zoom target). The Wikipedia summary is joined in at render time (`useArticle`), so templates never wait on the network and are unit-tested against the real data.

**Writing rules for templates**

- Every sentence is a message in the catalogues, filled with the record's own numbers, and cites where they come from.
- Say only what the data supports. A span's share is its *largest* share over its years, so an event story names who held the land then, without "most of".
- Prefer constructions that need no grammatical gender or case for an inserted name: "the land that is now {lane}" / "ozemlje, ki ga danes obsega {lane}".

**Adding a kind of story**: add a `StoryRef` variant and its hash path in `src/state/url.ts`, a template in `templates.ts`, its messages under `story.*` in every catalogue, and a record component in `Records.tsx` if it has provenance to show.

## Wikipedia client

`src/features/story/wiki.ts` uses the MediaWiki Action API (`origin=*`, `Api-User-Agent` header):

1. Title in the reader's language: the English article's language link, else the Wikidata sitelink.
2. Intro: `prop=extracts|pageimages|info|description` in one request (plain text, lead image, revision, URL).
3. Sections (eras that are a heading): `action=parse&prop=sections`, then the section's HTML, reduced to paragraphs without references.
4. Image credit: `prop=imageinfo&iiprop=extmetadata` (artist, licence).

Responses are memoised per URL for the session; a failed request is forgotten, so **Try again** really tries again.
