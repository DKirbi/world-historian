# World History Timeline

An interactive version of the "wall chart of history" idea. Time runs down the page and each column is a country with today's borders. Each block is a state that held part of that country's territory, from 3400 BCE to 2024.

The MVP covers the whole world in five regions, with 192 country columns and 1,696 records:

| Region | Columns | Records | Of which added from Wikidata / Wikipedia |
|---|---|---|---|
| Europe | 45 | 673 | – |
| Americas | 32 | 226 | 8 states, 100 cultures |
| Oceania | 12 | 36 | 10 states |
| Africa & Middle East | 70 | 419 | 18 states |
| Asia | 33 | 593 | – |

The map data comes from the open Cliopatria dataset (CC BY 4.0); added states, cultures, eras and key events come from Wikidata (CC0), Wikipedia (CC BY-SA 4.0, pinned revisions) and PeriodO (CC0); see `data/README.md`. A world coverage audit (`data/_coverage.json`) lists every piece of land and every source state that no column shows, with the reason.

Open a region directly with a bare anchor: `#europe`, `#americas`, `#oceania`, `#africa-middle-east` or `#asia`.

## Run it

```bash
npm install
npm run dev             # http://localhost:5173
npm test                # unit tests for scales, packing, ticks, formatting, data assembly
npm run build           # typecheck + production build in dist/
npm run build:artifact  # one self-contained page in dist-artifact/ (React & d3 from cdnjs)
```

## How to use the chart

| To… | Do this |
|---|---|
| Compare countries at one moment | Move the pointer over the chart (tap on phones). The year marker moves, and every column head shows who held that country in that year. |
| See the same moment as a table | Press **"1500 as a list"**, or Enter on the focused chart. |
| Follow one empire across Europe | Search for it, or click any of its blocks. It is painted in a highlight colour in every country, and the side panel lists where and when it held land. Up to three states can be highlighted at once. |
| Narrow the columns | Pick a group chip (Iberia, Andes…) or choose exact countries under **All countries**. |
| Choose the level of detail | Four levels, from the overview down: **Eras** (the periods of each culture area, as wide blocks), **Empires** (the leading state or culture of each country, merged across neighbouring countries), **States** (states that held at least 20% of a country or 100,000 km² of it, plus a lone smaller one) and **Detail** (every state, culture and key event). The level follows the zoom like a map's; the level control jumps to a level around the year marker. Tap an era or empire to zoom into it; tap a state for its details. |
| Zoom | Pinch, Ctrl/⌘ + wheel, the + / − buttons, or click a period name on the time axis. Zooming in zooms into the country as well: past a moderate time zoom the country columns widen, around your fingers or pointer, so the stacked blocks of a country are wide enough to read and tap (on a phone one country fills most of the screen and a strip of its neighbours stays in view). All selected countries stay in the chart: scroll sideways to compare them. Wheel scrolls through time; Shift + wheel or a sideways swipe scrolls across countries. |
| Keyboard | Arrow keys scroll, + / − zoom, 0 resets, Shift + ↑/↓ moves the year marker, Enter opens the year list. |

## Architecture

```
data/                      generated dataset (see data/README.md) + build tools
src/
  data/                    types, region registry, data source (one lazy chunk per region), useRegionData
  lib/                     pure logic, unit-tested
    time.ts                piecewise time scale (antiquity compressed, modern centuries wider)
    ticks.ts               per-segment adaptive year ticks
    pack.ts                packs overlapping spans of one lane into side-by-side columns
    spans.ts               detail filter, "who held it in year X", review-flag wording
    events.ts              event-type names and marker thinning (level of detail by Wikipedia language count)
    levels.ts              the four levels: thresholds by visible years, leaders per column (Empires), era layout (Eras)
    labels.ts              label wrapping and truncation with the measured font width
    format.ts              BCE/CE year and range formatting, approximate ("c.") and Wikidata-precision dates
  state/store.ts           zustand store: lane filter, detail level, events toggle, year marker, highlights, panel, theme, zoom commands
  components/ui/           design-system primitives: Button, IconButton, Chip, SegmentedControl, Popover, Sheet, Icon
  features/
    timeline/              Timeline (container), useTimelineZoom (d3-zoom), TimeAxis, EraBands, LaneHeaders,
                           EraBlocks (level 1), LeaderBlocks (level 2), SpanBlock (levels 3–4), EventMarkers,
                           SpanTooltip / EventTooltip / EraTooltip
    filters/               FilterBar, PolitySearch (combobox over states and events), CountryPicker
    details/               DetailPanel host, PolityDetails, EventDetails, YearSnapshot (table view), SourcesPanel
    legend/                Legend (key, highlights, credit)
  styles/                  tokens.scss (light + dark tokens), global.scss
```

**Rendering.** The chart is SVG, rendered by React. d3 only does the maths: `d3-scale` for the piecewise time scale and `d3-zoom` for pan and zoom gestures. Only spans that intersect the visible time window and lanes are rendered. This holds up comfortably at the current size (up to ~2,100 spans per region). If later regions push past ~5,000 visible marks, swap `SpanBlock` for a canvas layer behind the same `PlacedSpan` input.

**Levels of detail.** The chart reads the visible span of years: more than 1,500 years is Eras, 450–1,500 Empires, 120–450 States, fewer is Detail, with an 8% margin so the level does not flicker at a threshold. The design follows a few Laws of UX: a handful of large blocks per screen at the top levels (Hick's Law, Miller's Law, chunking), era blocks that enclose their culture area's columns (Law of Common Region), one wide block for an empire across neighbouring countries (Law of Similarity), whole blocks as tap targets (Fitts's Law), map-like zooming (Jakob's Law) and a level fade of 180 ms (Doherty Threshold).

**Events level of detail.** Each lane's events are thinned per frame by `thinEvents`: the event with articles in more Wikipedia languages wins wherever two markers would sit closer than 22 px, so zooming in reveals more. Labels appear only when a marker has 30 px of room and the column is at least 150 px wide (pick a country group to widen columns).

**Zoom model.** `d3-zoom` owns the time transform (`k`, `ty`). The column offset (`tx`) and width factor (`kx`) are tracked separately in `useTimelineZoom`, because the columns zoom more slowly than time: `kx = (k / 4)^0.7`, between 1 and the lane limit (most of the plot on a phone, a bit over half on a wide screen, so neighbouring countries stay in view). When `k` changes, `tx` is recomputed so the part of the columns under the gesture's centre (the pinch centroid, the pointer, or the middle of the plot for buttons, taps and the level control) stays under it; a pinch that also moves carries the columns along. Drag deltas still pan both axes. `laneZoom` and `anchoredTx` are pure functions with tests.

**Colour.** Colour is reserved for what the reader picks; everything else is grey.
- Block fill is a stone-grey ordinal ramp for how much of the country a state held: 50%+, 20–50%, under 20%.
- Hatching means the share counts the state together with its vassals.
- A pale block with a dashed edge is a state added from Wikidata whose territory is not mapped.
- Key events are dark dots ringed in the page colour, so they read on any block; a rail below a dot runs to a multi-year event's end.
- The three highlight colours are categorical slots; a highlight keeps its colour until it is removed.
- Both ramps are validated for colour-blind separation and contrast in light and dark themes.

**Adding a region** (every region so far was added this way):
1. Add the region's box, lanes and period bins to `REGIONS` in `data/tools/build_region.py`.
2. Build and verify it.
3. In `src/data/regions.ts`, set `available: true`, add its group labels, any `chartNote` or `notes`, and `initialYears` if most records are recent.

Each region is bundled into its own chunk (`src/data/bundles/<region>.ts`, plus one line in `BUNDLES` in `src/data/source.ts`). The app loads the open region first and prefetches the others when idle. To serve data over HTTP instead, implement `RegionSource.load()` with `fetch()` against the same paths.

## Known data limits

These come from the source data, not the app (details in `data/README.md` and the "Source notes" in each state's panel):
- Start and end years follow Cliopatria's map snapshots and can be a few years off textbook dates.
- Some states are modelled unusually. For example, the Kingdom of Great Britain runs to 2024, and the Holy Roman Empire splits into "Minor States" after 1259.
- Records flagged "Needs review" in each region's `_review.json`: 126 Europe, 28 Americas, 4 Oceania, 65 Africa & Middle East, 124 Asia.
- **Americas before 1500:** only a few Indigenous states are in Cliopatria. The chart adds 8 states from Wikidata and 100 dated cultures from Wikipedia's culture lists, without mapped territories, and cited eras for Eastern North America, Mesoamerica, the Antilles and the Andes. Greenland, Lower Central America, Venezuela, the Guianas and the Río de la Plata countries have no cited era before 1492.
- **Sub-Saharan Africa before colonisation:** many states are in the source (Mali, Songhai, Kongo, Axum and others); 18 more (Great Zimbabwe, Mutapa, Benin, Buganda, Kilwa and others) are added from Wikidata without mapped territories.
- **Asia:** the source starts Japan with the Asuka period (540) and the Philippines with Namayan (1202), so earlier centuries there show no state.
- **Oceania before colonisation:** only the Kingdom of Hawaiʻi is in the source. The Tuʻi Tonga Empire, the Saudeleur dynasty and the kingdoms of Tahiti, Samoa and Tonga are added from Wikidata, which gives Samoa, French Polynesia and "Tonga & other islands" their columns.
- **Eras:** cited periods exist for four culture areas of the Americas, Australia, New Zealand, Egypt, Sudan, sub-Saharan Africa (Iron Age and Classic Middle Ages only), Eastern Arabia, Japan, Korea, China (to 221 BCE) and twelve areas of Europe (Scandinavia, Ireland, Greece, the Netherlands, France to 1815, Iceland, Switzerland, Russia, Bulgaria, Croatia, Bosnia and Herzegovina, Moldova). Everywhere else (the rest of Europe, South and Southeast Asia, Central Asia, the Caucasus, the Levant, Anatolia, Mesopotamia, Iran, the Maghreb, Yemen, Polynesia, Melanesia, Micronesia), before an area's first period where its source starts late, and after its last period, each group of countries uses the region's period bins until culture-area periodizations are sourced for them.
