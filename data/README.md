# World History Timeline – data

Poster-style data for the interactive timeline.
- One **lane per modern country**, holding the **polities that controlled its territory over time**.
- Every span is computed from open datasets by `tools/build_region.py`. No date or name is entered by hand.
- `tools/audit_coverage.py` checks the whole world for land and polities that no lane shows (see **Coverage**).
- Cited layers come from Wikidata, Wikipedia and PeriodO snapshots in `sources/` (see **Cited layers**):
  - a check of every polity's Wikidata link, with Wikidata's own dates kept beside the chart's;
  - well-known states the map source does not include, shown without a mapped territory;
  - dated archaeological cultures of the Americas from Wikipedia's culture lists, also without a mapped territory;
  - key events (battles, wars, treaties, revolutions and more), placed in the country where they happened;
  - the **Eras** level: cited periods per culture area (the Americas, Oceania's Australia and New Zealand, parts of Africa & Middle East, Japan, Korea and China, and twelve areas of Europe so far), elsewhere the region's period bins.

| Region | Lanes | Records | Spans | Tier 1 / 2 / 3 | Added (states / cultures) | Eras (cited) | Event rows | Flagged "check" |
|---|---|---|---|---|---|---|---|---|
| `europe/` | 45 (+1 excluded) | 673 | 2,092 | 952 / 377 / 763 | – | 167 (79) | 2,496 | 126 |
| `americas/` | 32 (+1 excluded) | 226 | 441 | 178 / 115 / 148 | 8 / 100 | 61 (28) | 399 | 28 |
| `oceania/` | 12 | 36 | 54 | 33 / 16 / 5 | 10 / – | 23 (7) | 54 | 4 |
| `africa-middle-east/` | 70 (+2 excluded) | 419 | 1,420 | 798 / 345 / 277 | 18 / – | 83 (26) | 906 | 65 |
| `asia/` | 33 | 593 | 1,476 | 541 / 609 / 326 | – | 70 (21) | 619 | 124 |

192 country lanes in total, showing 1,696 distinct records: 1,560 Cliopatria polities, 36 states added from Wikidata and 100 cultures from Wikipedia's lists. 4,086 key events appear in at least one lane. "Check" flags now include Wikidata links the build corrected or hid.

## Folder layout

```
<region>/
  _index.json      lanes (order, group, km², period files), period bins, sources, build params,
                   omittedLanes (countries without a lane, each with its reason)
  _polities.json   registry: one record per polity, with Wikidata / Wikipedia / Seshat links
  _review.json     automatic flags on source records to check before release
  _eras.json       the Eras level: culture areas and their periods, with leaders and citations
  <lane>/<period>.json   spans for one country in one period bin
_coverage.json     world audit: land, polities and key events that no lane shows, with the reason
sources/
  supplement.json            editorial list of added states (Wikidata ids), with quoted overrides
  wikidata-supplement.json   Wikidata snapshot for those states (CC0)
  wikidata-polities.json     Wikidata snapshot for every Cliopatria polity's linked item (CC0)
  wikidata-events.json       Wikidata snapshot of candidate key events (CC0)
  eras-<region>.json         editorial list of culture areas: their columns and the cited rows of their periods
  wikipedia-eras.json        those rows as read from Wikipedia, with revision ids (CC BY-SA 4.0)
  periodo-eras.json          PeriodO definitions of the same periods, for cross-checking (CC0), keyed region|area|page|row
  cultures-<region>.json     rules for turning the culture lists into records (classes, exclusions, place aliases)
  wikipedia-cultures.json    the culture lists' rows, their Wikidata items and article leads (CC BY-SA 4.0 / CC0)
  names-<lang>.json          names of states, events and eras in another language: the English article's language
                             link, else the Wikidata label (CC BY-SA 4.0 / CC0); read by scripts/gen-names.mjs
tools/build_region.py    python3 build_region.py <region> <cliopatria.geojson> <ne_countries.geojson> <out_dir>
tools/enrich.py          the cited layers (link check, added states, events), used by build_region.py
tools/cultures.py        cultures from the Wikipedia lists; tools/eras.py the Eras level
tools/wikipedia.py, wikitext.py, fetch_eras.py, fetch_cultures.py, fetch_periodo.py   Wikipedia and PeriodO snapshots
tools/verify_region.py   independent checks against the raw sources and snapshots
tools/audit_coverage.py  world coverage audit; tools/audit_events.py adds the events section
tools/wikidata.py, fetch_*.py, wdcheck.py   snapshot fetchers and the link check
tools/fetch_names.py     python3 fetch_names.py <data_dir> <lang>: the names snapshot for the app's translations
translations/<lang>/
  _worklist.json           articles with no version in <lang>, by priority (scripts/translation-worklist.mjs)
  _sources/<region>.json   the English introductions to translate, with revision ids (CC BY-SA 4.0)
  <region>.json            the translations the drawer shows, each with its English source (CC BY-SA 4.0)
tools/fetch_translation_sources.py   python3 fetch_translation_sources.py <data_dir> <lang> <region>
```

Regions: `europe`, `americas`, `oceania`, `africa-middle-east`, `asia`.

A period file exists only if the lane has spans or events in that period. Each event is listed once per lane, in the file holding its start year. A span that crosses a period boundary appears in both files; dedupe on `id` + `from`. Polity ids are computed on the whole dataset, so a polity has the same id in every region (`spanish-empire` in Spain and in Mexico).

### Period bins

The bins are for loading and navigation only.

- **Europe:** the conventional periods, Bronze & Early Iron Age to Contemporary.
- **Americas:** the first four bins (Archaic, Preclassic, Classic, Postclassic) follow the summary table of [Mesoamerican chronology](https://en.wikipedia.org/wiki/Mesoamerican_chronology).
  - The Postclassic bin is cut at 1492, so European contact starts one bin for the whole continent.
  - Later bins are editorial. Andean and North American archaeology use different period names and dates.
- **Oceania:** editorial bins anchored on two cited dates.
  - "Before European contact" ends in 1521, when Magellan's expedition reached Guam ([History of Guam](https://en.wikipedia.org/wiki/History_of_Guam)). Most island groups met Europeans much later.
  - "Colonial era" starts in 1788, when the First Fleet reached Sydney Cove ([Australia Day](https://en.wikipedia.org/wiki/Australia_Day)).
- **Africa & Middle East:** cited anchors, with sub-Saharan chronologies differing from them.
  - Bronze Age (from −3400) and Iron Age (−1200 to −540) follow the [Ancient Near East](https://en.wikipedia.org/wiki/Ancient_Near_East) periodization table (Bronze Age 3300–1200 BCE, Iron Age 1200–539 BCE).
  - The Persian, Hellenistic & Roman era runs from −539 to 631; caliphates and sultanates start in 632 with the [Rashidun Caliphate](https://en.wikipedia.org/wiki/Rashidun_Caliphate).
  - The cut at 1500 is editorial.
  - The colonial era starts in 1885, after the Berlin Conference ([Scramble for Africa](https://en.wikipedia.org/wiki/Scramble_for_Africa)); independence starts in 1957, when Ghana became the first sub-Saharan country to gain independence ([Decolonisation of Africa](https://en.wikipedia.org/wiki/Decolonisation_of_Africa)).
- **Asia:** cited anchors that lean on South and East Asian history; other parts of Asia have their own chronologies.
  - Bronze Age to −1301: the [Indus Valley Civilisation](https://en.wikipedia.org/wiki/Indus_Valley_Civilisation) lasted c. 3300–1300 BCE.
  - Iron Age kingdoms to −222; classical empires from −221, the [Qin unification of China](https://en.wikipedia.org/wiki/Qin_dynasty).
  - Medieval kingdoms from 589, the [Sui reunification of China](https://en.wikipedia.org/wiki/Sui_dynasty).
  - Mongol era 1206–1367 ([Mongol Empire, 1206–1368](https://www.worldhistory.org/mongol_empire/)).
  - Early modern empires from 1368; age of imperialism from 1839, the [First Opium War](https://en.wikipedia.org/wiki/First_Opium_War); since 1946, after [Japan's surrender on 2 September 1945](https://en.wikipedia.org/wiki/End_of_World_War_II_in_Asia).

## Records

**Span** (in `<lane>/<period>.json`):

```json
{"id":"aztec-triple-alliance","name":"Aztec Triple Alliance","from":1429,"to":1520,"peak":0.11,"km2":207000,"tier":2}
```

| field | meaning |
|---|---|
| `from`, `to` | first and last year (inclusive) the polity counted for this country. Negative = BCE |
| `peak` | highest share of the modern country's area it held during the span (0–1) |
| `km2` | largest area it held inside the modern country during the span, rounded |
| `tier` | 1 = peak ≥ 0.5; 2 = peak ≥ 0.2 **or** km2 ≥ 100,000; 3 = the rest (detail) |
| `realm` | the peak counts the polity together with its vassal states (Cliopatria "(…)" rows) |
| `inside` | included because most of the polity lay inside this country, although it covered a small share of it (a city-state in a large modern country) |
| `large` | included because it held at least 100,000 km² of the country, although that is under the share threshold (early colonial footholds in Australia or the United States) |
| `extent` | `"unknown"` for an added state (no `peak` or `km2`): it existed here, its territory is not mapped |
| `cited` | where an added state's dates come from: `wikidata`, or `wikipedia` when a date is quoted from an article |
| `approx` | an added state's or culture's start or end is known only to the decade or century, or as "c." |
| `kind` | `"culture"` for an archaeological culture or people from the Wikipedia lists (not a state) |

**Event** (in `<lane>/<period>.json`, under `events`):

```json
{"id":"Q83224","name":"Battle of Hastings","year":1066,"type":"battle","links":80,"by":"coordinates","wiki":"Battle of Hastings"}
```

| field | meaning |
|---|---|
| `id` | Wikidata item |
| `year`, `to` | start year and, for multi-year events, last year (Wikidata P585, else P580 / P582) |
| `prec` | present when Wikidata gives the start only to the decade (8) or century (7) |
| `type` | battle, siege, invasion, campaign, war, revolution, rebellion, coup, treaty, pandemic |
| `links` | number of Wikipedia language editions with an article; the app uses it to thin overlapping markers |
| `by` | how it was placed: its `coordinates`, its `location`'s coordinates, or its `country` |
| `wiki` | English Wikipedia title |

**Polity** (in `_polities.json`):

| field | meaning |
|---|---|
| `id`, `name` | stable slug and display name |
| `years` | the polity's existence in Cliopatria |
| `wikidata` | Wikidata item id |
| `wikipedia` | English article title |
| `seshat` | Seshat polity ids |
| `realmOnly` | present when the polity exists only as a realm with its vassals |
| `wd` | result of the link check: `id` (the item the app links to), `status` (`ok`, `unknown`, `corrected`, `mismatch`), the item's `label`, and its `start` / `end` as `[year, precision]`; `sourceId` / `sourceLabel` when the build replaced or hid Cliopatria's link |
| `supplement` | added states only: `start`, `end` (year with `source` `"wikidata"` or an article URL and `quote`), `place` (lane and how it was chosen), `dateNote` |
| `culture` | cultures only: `dates` (`by` list / wikidata / period, with the quoted rows), `place` (columns, how they were chosen, the quoted text), `listed` (every row that lists it, each with a revision link), `languages` |

**Era** (in `_eras.json`, under `eras`; `areas` lists the culture areas and their sources):

```json
{"id":"andes-early-horizon","area":"andes","name":"Early Horizon","from":-900,"to":-200,
 "lanes":["colombia","ecuador","peru","bolivia","chile","argentina"],
 "leaders":[{"id":"paracas-culture","name":"Paracas culture"},{"id":"chavin-culture","name":"Chavín culture"}],"leadersBy":"source",
 "cite":{"page":"Periodization of pre-Columbian Peru","permalink":"https://en.wikipedia.org/w/index.php?oldid=1379392492",
         "quote":"Early Horizon (Also called Formative Period) | 900 BCE – 200 BCE","text":"Chavín, Late Chiripa, Paracas, …"}}
```

| field | meaning |
|---|---|
| `lanes` | the columns the block spans; non-adjacent columns are drawn as separate blocks |
| `leaders` | names shown under the era: the records the cited row names (`leadersBy: "source"`), else those most present in the data (`"data"`) |
| `cite` | the Wikipedia row, quoted, with a link to the revision read; absent for period bins (`basis: "period-bin"`) |
| `article` | the period's own Wikipedia article, `{title, section?}`, read from the wikilink in its cited row (see **Cited layers**, Eras); absent when the row links none, or links an example rather than the period |
| `periodo` | PeriodO definitions of the same period for the same countries, when there are any |
| `clippedFrom` | the source's start year when it lies before the chart's 3400 BCE |

## Method

1. **Lanes.** Modern borders come from Natural Earth 1:50m, clipped to a region box.
   - **Europe:** lon −32…60, lat 34…72. Russia is cut at 60°E; Svalbard, the Canary Islands, Madeira and overseas territories fall outside the box.
   - **Americas:** lon −170…−10, lat −57…84. Hawaiʻi, the Galápagos and Rapa Nui are removed. French Guiana is cut out of France's polygon as its own lane.
     - The Lesser Antilles share one lane: Antigua and Barbuda, Barbados, Dominica, Grenada, Saint Kitts and Nevis, Saint Lucia, Saint Vincent and the Grenadines, Montserrat, Anguilla, the British and US Virgin Islands, Saint Martin, Sint Maarten, Saint Barthélemy, Aruba, Curaçao, Caribbean Netherlands, and Guadeloupe & Martinique (France).
   - **Oceania:** lon 110…180 plus −180…−105, lat −56…30. The Pacific crosses the 180° meridian, so the box is two halves.
     - Hawaiʻi is cut from the United States and Rapa Nui from Chile.
     - Small island states are combined into "Micronesian islands" (Federated States of Micronesia, Palau, Marshall Islands, Kiribati, Nauru, Guam, Northern Mariana Islands) and "Tonga & other islands" (Tonga, Tuvalu, Cook Islands, Niue, American Samoa, Wallis and Futuna, Pitcairn, Rapa Nui).
   - **Africa & Middle East:** lon −26…64, lat −36…43. Turkey and Cyprus use the same lane definition as in Europe.
   - **Asia:** lon 25…180 plus Russia's far north-east beyond 180°, lat −12…82.
     - "Russia (east of 60°E)" is the part of Russia that Europe's lane leaves out.
     - Hong Kong and Macau are merged into the China lane.
2. **Overlap.** Every Cliopatria `POLITY` row is intersected with every lane in an equal-area projection (EPSG:6933): `share = overlap km² / lane km²`. Composite "(X)" rows only raise X's share in years where X itself has rows; on equal shares the core row wins.
3. **Which years count.** A year counts for a lane if any of these holds:
   - **Share rule:** `share ≥ minShare`, where `minShare = max(0.05, 500 km² / lane km²)`, capped at 0.5. This absorbs border misalignment in small lanes. Island lanes with no land borders use 0.05 without the 500 km² floor.
   - **Inside rule**, measured against the polity's *land*. Cliopatria's island and coastal polygons include sea, so the polygon is clipped to Natural Earth land first. Either of two conditions qualifies:
     - at least half of the polity's land lies in the lane, with ≥ 1,000 km² of overlap (Tenochtitlan in Mexico, Kazan in Russia), or
     - at least 80% lies in the lane, with ≥ 100 km² of overlap (city-states and free cities such as the Roman Kingdom, Bremen or the island states of the Lesser Antilles).
   - **Large-area rule:** the polity holds ≥ 100,000 km² of the lane. A foothold that size is never border noise, for example Spanish Florida and New Mexico inside today's United States.
4. **Micro-states.** A polity whose Wikidata id is that of a modern country without a lane (Monaco, San Marino, Liechtenstein) is never placed in a neighbour's lane by the inside rule.
5. **Spans** are runs of counted years, bridging 1-year gaps.
   - Years counted by share and years counted only by the inside or large-area rule never share a run. A remnant therefore never borrows the peak share and tier of the surrounding span: Norway, holding only Jan Mayen in 1941–1944, ends its span in 1940 and resumes in 1945.
   - A span shorter than 10 years is dropped unless:
     - it covered at least half the country, or
     - it held ≥ 100,000 km² of it (the Confederate States, the Duchy of Warsaw, the Peru-Bolivian Confederation).
6. **Identity** is the name plus Wikidata id. A gap of more than 50 years splits a polity into separate entries.
7. **Lanes without spans** are left out and listed under `omittedLanes` in `_index.json`. So are lanes the source has records for but where a column would mislead; each entry carries its reason.

## Cited layers

They read the snapshots in `sources/` (retrieved 2026-10-17: Wikidata and PeriodO under CC0, Wikipedia under CC BY-SA 4.0), never the live services, so a rebuild gives the same files. Wikipedia rows are read from a pinned revision and quoted with a link to it. The fetchers (`tools/fetch_polities.py`, `tools/fetch_supplement.py`, `tools/fetch_events.py`) use a descriptive user agent, `maxlag` and an on-disk cache.

1. **Wikidata link check** (`tools/wdcheck.py`). Cliopatria's own Wikidata id is kept when the item's dates plausibly cover the polity's years: Wikidata's start minus a tolerance must not fall after the polity's end, and its end plus the tolerance must not fall before the polity's start. The tolerance is 50 years at year, day or month precision, 60 at decade, 150 at century and 1,000 at millennium precision. An item without dates is kept as `unknown`. Otherwise the item of the polity's English Wikipedia title is used when its dates fit (`corrected`), else no link is shown (`mismatch`). Both are flagged for review. Example: Cliopatria links "Joseon" to the item for Gojoseon, an earlier state; the check follows the Wikipedia title "Joseon" instead.
   - Wikidata's dates are stored in `wd` and shown in the app beside the chart's. They are **not** used to change span years: Cliopatria's years describe when a state appears on its maps, which legitimately differs from founding and dissolution dates.
2. **Added states** (`sources/supplement.json`). Every state this README listed as missing from Cliopatria is added from its Wikidata item: name, start and end (P571 / P580, P576 / P582). Where Wikidata has no date, or where its date or location conflicts with the article, the value is a short quotation from the English Wikipedia article, stored with its URL. Century-level quotes ("11th century") use the century's first year and are marked approximate.
   - The territory is unknown, so the state is placed in **one** lane, chosen in this order: a quoted article ("located in modern-day Zimbabwe"), Wikidata's present-day location (P3842), the item's coordinates (P625), its capital's coordinates (P36 → P625), its country (P17), its capital's country.
   - Spans are tier 2 (shown under "Major powers"), carry `extent: "unknown"` and are drawn pale with a dashed edge. Spans are clipped to the chart's −3400…2024; the registry keeps the real years.
   - An added state that Cliopatria already includes (same Wikidata item) is skipped.
3. **Key events** (`sources/wikidata-events.json`). Candidates are Wikidata items that are an instance of (a subclass of) battle, siege, invasion, military campaign, coup, revolution, rebellion, war, treaty or pandemic, with articles in at least 12 Wikipedia languages, a common proxy for how widely an event is known. An item in several classes takes the first in that order.
   - Dates: start and end time (P580 / P582), else point in time (P585). Some wars also carry a P585 equal to their end (World War I: P585 1918 beside P580 1914), so the start and end win. A treaty is dated by its signing (P585, else inception P571, else P580, which on treaties is usually entry into force) and has no end. Decade-precision dates start at the round year and show as "1620s"; coarser dates are left out.
   - Placement: the event's own coordinates (P625); else its locations (P276) that lie in a modern country, each by its coordinates or, without coordinates, its country, with one marker per lane; else its own country (P17). Locations or countries spanning more than 3 countries in total leave the event out. A continent or sea has no country on Wikidata, so it never pins an event. A point counts for a lane when it lies inside it or within 30 km of it (coastal battles, small islands). Treaties therefore sit where they were signed (the Treaty of Versailles in France).
   - Not placed: events with no date or English label, outside −3400…2024, at sea or in a territory without a lane, or fought across more than 3 countries without a single place (most world wars and long multi-front wars). `_coverage.json` lists them by reason.
   - The app shows every placed event but thins overlapping markers to the one with articles in more languages; zooming in reveals the rest.

4. **Eras level** (`_eras.json`, `tools/eras.py`). A culture area is a set of columns covered by one published periodization (`sources/eras-<region>.json`); its periods are the rows of that periodization, read from a pinned Wikipedia revision.
   - Americas: Eastern North America (Canada, United States) from the table of North American archaeological periods; Mesoamerica (Mexico to Honduras) from the summary table of Mesoamerican chronology; the Antilles and the Bahamas from the list of pre-Columbian cultures (ages after Rouse 1992); the Andes (Colombia, Ecuador, Peru, Bolivia, Chile, Argentina) from Rowe and Lanning's periods. Each area's note says why those columns.
   - Oceania: Australia from the four periods the list of archaeological periods gives for it (Indigenous Period to 1606, then Pre-Settlement, Settlement / Pre-Industrial and Industrial/Modern; the list has no article of its own for them, so the quoted table row is the source); New Zealand from the Archaic and Classic periods and Early European contact as dated in the Māori history article (the list dates Archaic and Classic differently, by up to 300 years; the note says which was used and why). 
   - Africa & Middle East: Egypt from the periods that head the table of dynasties in *Dynasties of ancient Egypt* (Early Dynastic Period to the Hellenistic period, 3000 to 30 BCE); Sudan from the list of archaeological periods' sub-Saharan row (Bronze Age, linked to Nubia, then Iron Age and Classic Middle Ages); the other sub-Saharan mainland columns from the same row's Iron Age (550 BCE to 700 CE) and Classic Middle Ages (700 to 1700 CE), applied to five groups of columns (West, Central, East and Southern Africa, the Horn with South Sudan) so the names under each block come from that group's own states; Eastern Arabia (Kuwait, Bahrain, Qatar, the United Arab Emirates, Oman, Saudi Arabia) from the four periods of the Eastern Arabia section of *Pre-Islamic Arabia*. Not sourced yet: the Levant, Anatolia, Mesopotamia and Iran (the region's bins already follow the Ancient Near East table), the Maghreb (the list gives North Africa no dates beyond the Neolithic) and Yemen. The island columns of Africa are left out.
   - Asia: Japan from the list of archaeological periods (Jōmon, Yayoi) and the headings of *History of Japan* (Kofun to Reiwa); Korea from the list's Korean periods (Jeulmun, Mumun, Protohistoric, Three Kingdoms; the list's boundary "300/400 CE" is kept as both readings, so those two periods overlap for 100 years); China from the list's Neolithic period and Ancient China (its Imperial period is not used: the region's period bins divide those years more finely, at cited dates). Not sourced yet: South Asia (the Indus Valley article gives several competing periodizations and the list's South Asia stages overlap by centuries), Southeast Asia, Central Asia, the Caucasus, Mongolia, Taiwan and Eastern Russia. PeriodO matches seven of the Japanese periods (British Museum), with dates within a few decades of Wikipedia's.
   - Oceania, continued: Polynesia, Melanesia and Micronesia have no sourced periodization yet: the periods the Tonga and Pohnpei articles give belong to those islands, not to the chart's combined columns, so those columns use the period bins.
   - Europe: twelve areas. Scandinavia (Denmark, Norway, Sweden) from the Northern Europe row of the list of archaeological periods (Nordic Bronze Age, c. 1700 BCE, to Post-medieval, to c. 1800; the row names no countries, so those three columns are an editorial choice). Eleven single columns from the dated section headings of their *History of …* article: Ireland (prehistory to the present), Greece (from the Neolithic to the present; the article's sections between the Fourth Crusade, 1204, and the 15th century carry no date range, so that stretch stays blank), the Netherlands (Roman era to 1839), France (Frankish kingdoms to 1815), Iceland, Switzerland (from 1300), Russia, Bulgaria (from 681), Croatia (from 800), Bosnia and Herzegovina (from 1463) and Moldova (from 1346). The articles' own overlaps are drawn as written (Russia: Kievan Rus' to 1240, the Mongol period from 1223, Moscow from 1283; Moldova: Moldavia to 1862, Bessarabia from 1812). A century heading ("15th century – 1821") is read as the whole century and marked approximate. Not sourced yet: Iberia (the headings give overlapping centuries, or modern dates only), Italy and Germany (modern dates only), Austria (headings follow reigns and wars), Poland (its Commonwealth heading is undated), Hungary (gaps of centuries), the United Kingdom, Turkey, Cyprus, Malta, Finland, the Baltic states, Belarus, Ukraine, the other Balkan and central European countries and the small states (undated headings, or none): they keep the region's period bins.
   - Everywhere else, and after an area's last period, each lane group gets the region's period bins, kept only where the data records some state or culture. An area whose source starts late sets `"binsBefore": true` in its config, and the bins then fill the years before its first period too (Europe's countries; not when the leftover would be shorter than 25 years, as in France between 476 and 486). In the Americas the bins start at 1492, because the earlier ones are Mesoamerican names.
   - The era's own article (`article`): the first wikilink of its cited row, kept only when the link is about the period, that is when its title shares a significant word with the era's name ("Old Kingdom" → *Old Kingdom of Egypt*; "Early Woodland" → *Woodland period*, section "Early Woodland period (1000–1 BCE)"), or starts with the name ("Late Period" → *Late Period of Egypt*). A row that links "Bronze Age" to *Nubia* or "Iron Age" to *Ghana Empire* points at an example, so no article is given. 30 eras have one. Eras whose row is a heading of a "History of …" article get no `article`; the app reads that heading's section instead.
   - Names under an era: the cultures its cited row lists, when the chart has them (matched by Wikidata item); otherwise the records with the most lane-years, weighted by tier and by Wikipedia language editions. After 1492 the rows list Indigenous peoples under colonial rule, so the names come from the data.
   - PeriodO (`sources/periodo-eras.json`) adds other scholarly datings of the same period where it has them (for example the Oxford Handbook of Mesoamerican Archaeology's Late Postclassic, 1400–1521).
5. **Cultures of the Americas** (`tools/cultures.py`, rules in `sources/cultures-americas.json`). The index is every linked culture in Wikipedia's list of pre-Columbian cultures, the table of North American archaeological periods and the periodization of pre-Columbian Peru.
   - Kept when its Wikidata item is a culture, people or polity, or when a dated list row names it as a culture; it needs a start and an end, overlapping the chart and starting before 1600. Living peoples ("–present") and records already on the chart are left out; four duplicates are excluded by hand, each with its reason.
   - Dates: the row's own, else Wikidata's, else the periods it is listed under (approximate).
   - Columns: the places the row names (US states, Canadian provinces and Mexican states are read with a gazetteer from Wikidata; "Greater Antilles" with a quoted definition), else the source's country, else Wikidata coordinates or country, else the places in the first paragraph of its own article, else Peru for the Peruvian table.
   - Tier 2 (shown from the States level) with articles in at least 15 Wikipedia languages, else tier 3 (Detail level). Drawn like added states: pale with a dashed edge.

## Coverage

`_coverage.json` is written by `tools/audit_coverage.py`.

**Land.** Every Natural Earth territory of at least 100 km² that no lane covers is listed with a reason. No territory is left where the source has a state specific to it and no column shows it. The rest falls into three groups:
- **Excluded on purpose, with the reason in `omittedLanes`:**
  - Liechtenstein: neighbouring polygons cover it at this map scale.
  - Falkland Islands (Islas Malvinas): the source leaves out the 1774–1833 Spanish and United Provinces period ([Reassertion of British sovereignty, 1833](https://en.wikipedia.org/wiki/Reassertion_of_British_sovereignty_over_the_Falkland_Islands_(1833))).
  - Réunion: French colonial records only, under other names.
  - Seychelles: the source's polygons are offset from the islands.
- **No state in the source:** Antarctica, Jersey, the Cayman Islands, Saint Helena, British Indian Ocean Territory, Heard Island, Christmas and Cocos Islands, Prince Edward Islands.
- **Only wider states, already shown in other columns:**
  - Islands and territories: Åland, Svalbard and Jan Mayen, the Canary Islands, Madeira, the Arctic islands of Russia west of 60°E and north of 72°N, Alaska's westernmost Aleutians, the Galápagos, Saint Pierre and Miquelon, Turks and Caicos, South Georgia, the French Southern Lands.
  - The Siachen Glacier.

**Polities.** Of Cliopatria's polities, 92 appear in no lane:
- 75 lasted under 10 years and never held 100,000 km² of a country.
- 7 are micro-states or belong to an excluded territory.
- 10 fall below the share and inside thresholds everywhere, for example the Kingdom of Adiabene and the Chechen Republic.

## Known limitations

### All regions

- **Span edges follow Cliopatria's map snapshots.** They can be a few years off textbook dates.
- **Cliopatria records states.** It requires roughly ≥ 5,000 km² and ≥ 50 years, with rare exceptions, so small or short-lived polities are missing.
- **Key events are a Wikidata selection, not the poster's.** Voyages, discoveries, foundings and other milestones that are not battles, wars, treaties, revolutions, rebellions, coups or pandemics are not included yet, and region-wide wars without a single place are left out.
- **Added states show presence, not extent.** Their blocks say a state existed in that country in those years, not how much of it they held.

### Americas

- **An empty column does not mean the land was empty.** Most Indigenous nations and peoples are absent because Cliopatria maps few polities in the Americas before 1500. The exceptions in the data are:
  - Mesoamerica: Olmec, Zapotec, Maya city-states, Teotihuacan, Classic Veracruz, Toltec, Michoacán, the Aztec Triple Alliance and its member cities, the Itza.
  - Andes: Chimú and the Inca.
  - North America: the Chaco and Aztec Pueblo systems and the Haudenosaunee.
- **Added from Wikidata** because Cliopatria v0.2.1 does not include them (checked by name against the whole dataset): the Caral–Supe civilization, Chavín, Moche, Nazca, Wari, Tiwanaku, the Muisca Confederations and the Mississippian culture. Each sits in one column (Peru, Bolivia, Colombia, the United States) with its extent not mapped.
- **100 dated cultures from Wikipedia's lists** fill the pre-Columbian columns, from Poverty Point, Adena and Hopewell to Saladoid, the Lucayans, Gran Coclé, Valdivia, Paracas, Chachapoya and the Diaguita. Left out: 13 without dates (Taíno, Lenca, Kalinago…), 3 without a place (Deptford, Norwood, Weeden Island), and the Mixe, a living people.
- **Columns with no cited era before 1492:** Greenland, Nicaragua, Costa Rica, Panama, Venezuela, the Guianas, Brazil, Paraguay and Uruguay. Their cultures appear from the Empires level down.
- **Colonial claims follow the source maps:**
  - The British Colonial Empire covers Canada until 1931; Cliopatria starts "Canada" in 1932.
  - Mexico has a gap from 1913 to 1919.

### Asia

- **Dense coverage** from the Indus Valley Civilisation (from 3000 BCE in today's Pakistan) and the Shang dynasty in China (from 1600 BCE).
- **The source starts some countries late:** Japan with the Asuka period (540), Indonesia with Tarumanagara (367), the Philippines with Namayan (1202). Earlier centuries there show no state.
- **Columns follow Natural Earth polygons.** Taiwan is a separate lane, Hong Kong and Macau are counted within China, Kashmir is divided as in those polygons and the Siachen Glacier has no lane. This is a mapping convention, not a position on disputed borders.
- **Source quirks to review:** for example, the United States of America appears in Japan in 1946–1966 and in Vietnam in 1967–2005, and "Golden Horde" in Mongolia in 1547–1695.

### Africa & Middle East

- **The Middle East and North Africa are densely covered from 3400 BCE** (Sumer, Egypt, Assyria, Persia through to modern states).
- **Pre-colonial states in the data:** Kush, Axum, Makuria, Alodia, the Ghana Empire, Takrur, Kanem and Bornu, Mali, Songhai, Kongo, Oyo, Ashanti, Lunda, Merina, Sokoto, Zululand, the Ethiopian Empire, Adal, Funj, Darfur and Wadai.
- **Added from Wikidata** because Cliopatria does not include them (checked by name): Kerma, the Garamantes, Ife, the Benin Empire, the Kilwa Sultanate, the Kingdom of Zimbabwe, the Hausa Kingdoms, the Mossi Kingdoms, Jolof, the Kingdom of Rwanda, Buganda, Mutapa, Ndongo, the Kingdom of Baluba, Bunyoro, Dahomey, the Kuba Kingdom and Kaabu. Kitara is left out: Wikipedia calls it "an ancient legendary state" ([Empire of Kitara](https://en.wikipedia.org/wiki/Empire_of_Kitara)). Other Swahili city-states besides Kilwa are not added yet.
- **Columns follow Natural Earth polygons.** Palestine and Western Sahara are separate; Somaliland is merged into Somalia and Northern Cyprus into Cyprus. This is a mapping convention, not a position on disputed borders.
- **Source naming quirks:** for example, Nigeria is listed under "British Gold Coast" from 1885 to 1960.

### Oceania

- **Cliopatria's only Pacific state before colonisation is the Kingdom of Hawaiʻi** (from 1791). Added from Wikidata: the Tuʻi Tonga Empire, the Saudeleur dynasty of Pohnpei, the Kingdoms of Tahiti, Samoa and Tonga, German Samoa, the Western Samoa Trust Territory, and today's Samoa, Tonga and French Polynesia. These give Samoa, French Polynesia and "Tonga & other islands" their columns.
- **Tonga has a gap from 1827 to 1899.** Wikidata's item for the Tuʻi Tonga Empire ends in 1826 and its item for the Kingdom of Tonga as a protected state starts in 1900.
- **Aboriginal and Torres Strait Islander nations and Māori iwi are not shown.** They are peoples and nations rather than states with dated borders in either source.
- **British settlement in Australia began in 1788** but appears from 1828, when the source maps first show more than 100,000 km² of today's Australia under Britain.
- New Caledonia is recorded under "French Indochina" from 1860 to 1957, which is how the source groups French possessions.

### Europe

- `kingdom-of-great-britain` runs 1709–2024.
- The Holy Roman Empire's core rows end in 1259; after that Cliopatria uses `holy-roman-empire-minor-states`.
- Post-1945 occupation zones appear as the occupying power.

## Changes

- **2026-10-24, translated summaries (Europe, part 2 of 7).**
  - `translations/sl/_sources/europe.json`: the English intros of 353 more units shown in the Western Europe and Low Countries columns (38,551 words, revisions of 23 October 2026), fetched with `--groups western,low-countries`.
  - `translations/sl/europe.json`: all 353 translated in nine parts (34 states, 319 events; 32,840 words), marked as machine translations, not yet reviewed. Europe now has 713 of its units translated (66,028 words).
  - One more Slovenian name corrected in the overrides: the Battle of Wissembourg was labelled *Bitka pri Wssembourgu*. Summaries now use the glossary's *dirka do morja* for the Race to the Sea (the first parts said *tek k morju*), *bitka na Boorni* for the Battle of the Boarn and *Veliki Condé* for the Great Condé.
  - Units whose source has a quirk say so in `notes` (64). Records linked to the wrong article: Angevin (a disambiguation page, translated as a list fragment) and Bretons (the article on the people for a state record). Sentences broken across paragraphs or cut before a list: Battle of Lens, Battle of Arnemuiden, Merger Treaty, 1991 Paris Peace Agreements; a sentence without a main verb: Battle of Arnhem. Slips in the English kept as they are, with a note: Battle of La Rochelle (the Castilian fleet's strength given as the English fleet's), Coup of 18 Fructidor (the Gregorian date labelled as the Republican one, corrected in the Slovenian), Siege of Calais (1940) and Battle of Boulogne (12:40 a.m. and 12:40 p.m. for the same order). Glossary headlines that differ from the English name: Kingdom of Soissons, First Hundred Years' War.
- **2026-10-23, translated summaries (Europe, part 1 of 7).**
  - `translations/sl/_sources/europe.json`: the English intros of 360 units shown in the Iberia and British Isles columns (38,775 words, revisions of 23 October 2026), fetched with `--groups iberia,british-isles`. The fetch tool now leaves out template residue (the Battle of Clavijo extract began with `|campaignbox = campaignbox =`).
  - `translations/sl/europe.json`: all 360 translated in nine parts (72 states, 288 events; 33,187 words), marked as machine translations, not yet reviewed. `scripts/translation-chunks.py` now cuts the chunks; it skips units translated for any region.
  - One more Slovenian name corrected in the overrides: the Reapers' War was labelled *Vojna žajncev* (*žanjcev*).
  - Units whose source has a quirk say so in `notes` (52). Records linked to the wrong article: Berga, Pallars Jussà and Pallars Sobirà (modern town and comarcas for medieval states), Strathclyde (the modern council region for the medieval kingdom), Earl of Desmond (the title for the earldom). Sentences broken across paragraphs or cut before a list: First Battle of St Albans, London Protocol (1852), Siege of Barcelona (1705), War of the Castilian Succession, Battle of the Standard, Battle of Simancas, Treaty of Alcáçovas, Treaty of Edinburgh–Northampton, Lisbon Recognition Convention. Slips in the English kept as they are: Palmerston as Foreign Secretary in 1862, Columbus's claim dated 1494.
- **2026-10-23, translated summaries (Africa & Middle East, part 3 of 3).**
  - Part 3, sub-Saharan Africa and the Indian Ocean islands: the 207 snapshotted units translated into `translations/sl/africa-middle-east.json` in six parts (54 states, 153 events; 19,098 words), marked as machine translations, not yet reviewed. All 918 snapshotted units of the region are now translated (81,348 words).
  - Review sweep across Africa & Middle East, the Americas and Oceania: 189 definition sentences now agree the verb with the subject (*Bitka pri Tangi je bila neuspešen vdor*, not *je bil*).
  - Units whose source has a quirk say so in `notes`. Records linked to the wrong article: Portuguese Africa and Zululand (disambiguation pages, translated as list fragments), Omanis (the article on the people, not Omani rule in East Africa). Keys that resolve to a broader article: Boer Wars (Military history of South Africa), Herero uprising (Herero and Nama War), War in Somalia (2006–2009) (Ethiopian invasion of Somalia). Text problems in the English excerpt: a sentence broken across paragraphs (Ife Empire, Battle of Jassin), a garbled sentence (French Consulate), a misspelt town (*Molten* for Molteno, Battle of Stormberg). Glossary headlines that differ from the English name: Kivu conflict (*Tretja kongovska vojna*), Kingdom of Great Zimbabwe, Oyo Empire.
- **2026-10-23, translated summaries (Africa & Middle East, part 2 of 3).**
  - Part 2, Anatolia and Cyprus, North Africa and Egypt: the 348 snapshotted units translated into `translations/sl/africa-middle-east.json` in nine parts (2 eras, 44 states, 302 events; 30,424 words), marked as machine translations, not yet reviewed. 711 of the region's 918 snapshotted units are now translated; part 3 (207) remains.
  - One more Slovenian name corrected in the overrides: the sack of Amorium was labelled *Oplenitev Armorija*.
  - Units whose source has a quirk say so in `notes`: a record linked to the wrong article (Kastamonu, a state linked to the modern city), sentences broken across paragraphs or cut mid-sentence in the English excerpt, glossary names worth harmonising.

- **2026-10-23, translated summaries (Africa & Middle East, part 1 of 3).**
  - Africa & Middle East has 920 worklist units, twice the Americas, so it is translated in three parts by column group. `tools/fetch_translation_sources.py --groups` snapshots only the units with a record in those columns; a unit shared by two parts goes with the first one.
  - Part 1, the Middle East (Levant, Mesopotamia and Iran, Arabia): 363 units snapshotted (37,227 words) and translated into `translations/sl/africa-middle-east.json` in nine parts (62 states, 301 events; 31,828 words), marked as machine translations, not yet reviewed.
  - Parts 2 (Anatolia and Cyprus, North Africa: 348 units, 34,805 words) and 3 (sub-Saharan Africa and the Indian Ocean islands: 207 units, 21,879 words) are snapshotted in the same `_sources` file, revisions of 23 October 2026. Early Dynastic Period (Egypt) has a Slovenian article; Dutch Cape Coast has no English article.
  - Six Slovenian names corrected in `src/i18n/names/sl.json` overrides: North Yemen, the Neo-Assyrian and Neo-Babylonian empires, the sieges of Acre, Jaffa and Deir ez-Zor, and the third battle of Fallujah.

- **2026-10-23, translated summaries (the Americas).**
  - `tools/fetch_translation_sources.py` now takes a region's units in parts (it skips units already translated), and fetches an era that is a section of a longer article as that section's text. The Americas have 456 worklist units; French Fifth Republic was already translated with Oceania. It re-checked the rest against their language links: Mississippian culture has a Slovenian article; Late Archaic has no English article at all (its era tells its story from the data). The other 453 were snapshotted as the drawer prints them: 51,034 words, revisions of 23 October 2026.
  - The three Woodland period eras link to sections whose headings Wikipedia editors had re-dated ("Early Woodland period (1000–1 BCE)" is now "(1000–200 BCE)"). The tool and the app now fall back to the heading without its bracketed dates; before this, the drawer found no text for these eras.
  - `translations/sl/americas.json`: the 453 translated with the project's Slovenian newspaper style in twelve parts, marked as machine translations, not yet reviewed (44,137 words). `scripts/merge-translations.mjs --partial` checked paragraphs, numbers and banned calques before writing each part.

- **2026-10-22, translated summaries (Oceania).**
  - `scripts/translation-worklist.mjs sl` lists 4,249 English articles whose stories have no Slovenian article (from the names snapshot), by priority; Oceania has 63.
  - `tools/fetch_translation_sources.py` re-checked all 63 against the English articles' language links (none has a Slovenian article) and snapshotted their introductions, cut as the drawer prints them (up to 3 paragraphs, 1,100 characters): 6,909 words, revisions of 22 October 2026.
  - `translations/sl/oceania.json`: the 63 translated with the project's Slovenian newspaper style, marked as machine translations, not yet reviewed (5,991 words). `scripts/merge-translations.mjs` checked paragraphs, numbers and banned calques before writing it.

- **2026-10-21, era articles and names in other languages.**
  - `eras.py` gives eras the Wikipedia article their cited row links to (`article`, 30 eras), for the app's stories. `verify_region.py` checks that each article is a link written in the cited row itself, and that only cited eras have one.
  - A full rebuild from the pinned sources reproduced every published file byte for byte before this change; after it, only the five `_eras.json` files differ, and only by the new field. Verify reports 0 errors for all five regions.
  - `tools/fetch_names.py` snapshots names of states, events and eras in another language (`sources/names-<lang>.json`); the app's `scripts/gen-names.mjs` turns the snapshot into `src/i18n/names/<lang>.json`.
  - `sources/names-sl.json` (retrieved 2026-10-21): Slovenian titles or Wikidata labels for 1,234 of 1,696 states, 1,529 of 4,086 key events and 13 of 27 eras with an article. After resolving names that two different records would share, the app uses 1,064 state, 1,488 event and 13 era names.

- **2026-10-17, Europe eras.**
  - 79 cited eras in twelve areas (Scandinavia 7, Ireland 10, Greece 6, the Netherlands 9, France 5, Iceland 4, Switzerland 3, Russia 8, Bulgaria 6, Croatia 8, Bosnia and Herzegovina 7, Moldova 6), quoted from pinned revisions of eleven articles and the list of archaeological periods; PeriodO adds other datings for the two last Scandinavian periods. Europe now has 167 era blocks.
  - `wikitext.py` reads century dates ("late 11th century BCE", "15th century – 1821", "5th–8th centuries"): the start of a range takes the earliest year of the century, the end the latest, and the era is marked approximate.
  - Fix: `fetch_periodo.py` keyed its matches by row alone, so a row that several areas share (sub-Saharan Africa's Iron Age and Classic Middle Ages, one per group of columns) kept only the last area's matches. They are now keyed per area, so Nubia's Iron Age shows the datings that cover Sudan again.
  - Era ids of bins placed before an area's first period include their end year (two lanes of one group can start a bin in the same year and end it in different ones); the build asserts that ids are unique.
  - `eras.py`: an area can set `"binsBefore": true` so the region's period bins also fill the years before its first period (Switzerland before 1300, Bulgaria before 681); a leftover shorter than 25 years is dropped. Areas without the option build exactly as before (all other regions' `_eras.json` are unchanged).
- **2026-10-17, Asia eras.**
  - 21 cited eras in three areas (Japan 15, Korea 4, China 2), quoted from pinned revisions of two articles.
  - `fetch_eras.py` reads the years of a heading from its last bracket, so a name with a dash of its own ("Azuchi–Momoyama period (1568–1600)") parses.
  - Layout: periods of the same columns that overlap in time now share the width only for the years of the overlap (stepped outline), and unevenly (58 / 42), so the split cannot be mistaken for a column boundary. This also fixes Late Woodland and Mississippian in the Americas, which looked like one period per country.
- **2026-10-17, Africa & Middle East eras.**
  - 26 cited eras in eight areas (Egypt 9, Sudan 3, five sub-Saharan groups 2 each, Eastern Arabia 4), quoted from pinned revisions of three articles; PeriodO adds other datings for 17 of them (Egypt, Arabia, the Iron Age).
  - Layout: eras of one area that overlap in time but cover different columns (two period bins with different start years) no longer share the width; only eras that share a column go side by side.
- **2026-10-17, Oceania eras.**
  - Seven cited eras: four for Australia (list of archaeological periods) and three for New Zealand (Māori history), each quoted from a pinned revision; New Zealand returns to the period bins after 1840.
  - `fetch_eras.py` is now incremental: eras already in `wikipedia-eras.json` keep their pinned revision and text (the Americas rows are unchanged); only new rows are fetched, and `--refresh` fetches everything again. Rows the config no longer asks for are dropped.
  - An era can set `"named": false` so the cultures linked near its text (a heading over prose, a list row) are not taken as its leaders; its leaders then come from the data.
  - PeriodO has no match for these periods.
- **2026-10-17, cited layers, Americas cultures and the Eras level.**
  - Wikidata snapshots (CC0): link check for every polity (corrected 15 links through their Wikipedia articles, hid 64 whose dates do not match), 36 added states for the Americas, Africa and Oceania, 5,010 candidate key events (4,086 shown).
  - Wikipedia snapshots (pinned revisions): the periods of four culture areas of the Americas and 100 dated cultures from the lists of pre-Columbian cultures, North American archaeological periods and Peruvian periods.
  - PeriodO snapshot: other scholarly datings of the same periods, where PeriodO has them.
  - Oceania: Samoa, French Polynesia and "Tonga & other islands" gain columns from the added states.
  - New `_eras.json` per region for the app's Eras level; every region gets period-bin eras per lane group with leaders computed from the data.
  - The build now clears a region's period files before writing, so files of an earlier build cannot linger.
  - Verify checks the added states, cultures, events and eras against their snapshots, including that each culture's years can be read from its quoted rows. All five regions pass.
- **2026-10-17, coverage audit and Asia.**
  - Asia added: 33 lanes, 593 polities.
  - New lanes found by the audit:
    - Europe: Andorra, Isle of Man, Faroe Islands.
    - Americas: Lesser Antilles.
    - Africa & Middle East: Bahrain, São Tomé and Príncipe, Mauritius.
  - Americas box widened to 10°W: Greenland's lane previously stopped at 30°W, losing its eastern part.
  - Method changes:
    - The inside rule is now measured against land, and gained the 80% / 100 km² condition.
    - Micro-states are no longer placed in neighbour lanes.
    - Short spans are kept when they held 100,000 km² or more.
    - Share years and remnant years no longer merge into one span.
  - Effect on the four existing regions: 436 spans added, 145 replaced.
    - Additions: 18 tier 1, 183 tier 2, 235 tier 3. Examples: the Roman Kingdom in Italy, the Free City of Danzig 1919–1939, the Confederate States, the Duchy of Warsaw, the Republic of the Rio Grande.
    - 18 tier-1 spans were re-cut to the years the polity held at least half the country; its growth or remnant years became separate, smaller spans. Examples: the Ottoman Empire in Turkey now starts its tier-1 span in 1344, with 1305–1343 separate; Greenland's own polity is tier 1 from 1911; British rule in Australia is tier 1 from 1856, with 1828–1855 separate.
- **2026-10-16, Africa & Middle East added.** When a polity's core and realm rows give the same share, the core now wins (changed the `realm` flag on 58 Europe spans and 1 Americas span).
- **2026-10-16, Oceania added.** The method gained the large-area rule, island lanes and omitted-lane reporting.
- **2026-10-16, Americas added.** The method gained the inside rule and the 100,000 km² route to tier 2.

## Sources and attribution

- **Cliopatria v0.2.1**, Seshat Global History Databank. <https://github.com/Seshat-Global-History-Databank/cliopatria>, paper DOI [10.1038/s41597-025-04516-9](https://doi.org/10.1038/s41597-025-04516-9).
  - Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  - **Changes made:** polygons intersected with modern country borders to derive per-country spans, coverage shares and areas; entities split on gaps over 50 years. Names, years and links are otherwise as published.
- **Natural Earth** 1:50m Admin 0 Countries, public domain. <https://github.com/nvkelso/natural-earth-vector>

The app's Sources panel carries the Cliopatria credit, the licence link and the "changes made" note.

## Rebuild

```bash
pip install geopandas shapely pyproj pyogrio
git clone --depth 1 https://github.com/Seshat-Global-History-Databank/cliopatria.git
unzip cliopatria/cliopatria.geojson.zip -d clio
curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
C=clio/cliopatria_polities_only_v021.geojson; N=ne_50m_admin_0_countries.geojson
for r in europe americas oceania africa-middle-east asia; do
  python3 tools/build_region.py $r $C $N out/
  python3 tools/verify_region.py $r out/ $C $N
done
python3 tools/audit_coverage.py $C $N out/ --json out/_coverage.json
python3 tools/audit_events.py $N out/ --json out/_coverage.json
```

The snapshots in `sources/` are rebuilt only on purpose (they change when Wikidata, Wikipedia or PeriodO change):

```bash
python3 tools/fetch_polities.py ... ; python3 tools/fetch_titles.py ...   # Wikidata link check
python3 tools/fetch_supplement.py sources/supplement.json sources/wikidata-supplement.json
python3 tools/fetch_events.py sources/wikidata-events.json 12
python3 tools/fetch_eras.py sources/        # Wikipedia rows of the culture-area periods
python3 tools/fetch_cultures.py sources/    # Wikipedia culture lists + Wikidata facts
python3 tools/fetch_periodo.py sources/ $N  # PeriodO cross-check (downloads data.perio.do/d.json)
```

`out/` must contain a copy of `sources/`.

The build is deterministic: rebuilding in a fresh environment reproduced the previously published files byte for byte before this round of changes. The verify step reports 0 errors for all five regions. It checks:
- every file parses, every span resolves to a polity and sits inside its period, and every tier matches the rule;
- every polity matches raw Cliopatria rows;
- every era `article` is a link written in its cited row;
- the share and area of 40 random spans per region, recomputed by a separate code path.
