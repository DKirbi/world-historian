# Replay (prototype): Rome's wars, 343–30 BCE

A Civilization-style replay of one stretch of history: borders change on a hexagon board, events happen where and when the sources put them, and the camera follows them. The chart, cut down to the countries where the events happened, is the minimap and the scrubber. Nothing is simulated: every hexagon is a Cliopatria polygon, every event a Wikidata item with its stored Wikipedia text.

```bash
npm run dev            # http://localhost:5173/replay.html  (?lang=sl for Slovenian)
npm run build:replay   # one self-contained page: dist-replay/replay.html
```

## What the reader sees

| Part | What it is |
|---|---|
| Board | Cliopatria's polities as H3 hexagons: resolution 3 (about 12,400 km²) for the whole stage, resolution 4 (about 1,770 km²) when zoomed in. Rome in the selection colour, every other state in the stone ramp, land with no state recorded dotted. Borders step at Cliopatria's own sample years; they are never animated across land, which would invent the pace of a conquest. |
| Event card | The story drawer's type as a notification: kicker (class · war), slab headline, dateline (Wikidata's date, as precise as it is recorded), the stored Wikipedia introduction or its Slovenian translation (tagged when machine-made), the sides on Wikidata, the source with its revision. |
| Minimap | The chart's own columns and blocks for the countries with the most events (Spain, France, Italy, Albania, Greece, Turkey, Syria, Tunisia), plus a column of the wars. Press or drag to move the playhead; select a dot to stop on its event, a bar to read about its war. |
| Transport | Play / pause, previous / next event, speed (1×, 2×, 4×), major events (20+ Wikipedia editions, about 7 minutes at 1×) or all events, and whether the camera follows. |

Keys: Space plays or pauses, ← / → go to the previous or next event, Esc closes the card.

## How it plays

- **Clock** (`src/replay/clock.ts`, tested): the playhead runs at 1.5 years a second during a war and 6 between wars, but never so slowly that the next event is more than 2.5 seconds away. It stops on each event for 5 seconds with a text (3 without); faster speeds shorten the stop by the square root, so the card stays readable.
- **Director** (`App.tsx`): the camera frames the event on the card; between two events close in time and place (2.5 years, 650 km) it holds; otherwise it pulls back to the theatre of the wars under way, never closer than a little inside the whole board. The board never shows the edge of its own data. On a phone the event sits above the card.
- **Wars**: an event's war is the nearest dated conflict above it on Wikidata. Umbrellas (a war grouping two or more of the replay's wars, like the Punic Wars, or one outlasting the replay by far, like the Roman–Gallic Wars) are not drawn as bars and do not set the pace.

## Data

`data/replay/rome.json` is built by `data/tools/build_replay.py` from snapshots only (see `data/README.md`, **Replay**). Which events belong to "Rome's wars" is decided by Wikidata (Rome took part in the event or in a conflict it is part of) and by the editorial file `data/sources/replay-rome.json`: five anchors (the civil wars list, the crisis of the Republic, Augustus's wars, the conquests of Hispania and Britain), four additions and three removals, each with a quotation the build checks.

## Known limits

- **Gauls, Iberians, Samnites and most peoples of the period are not states in Cliopatria**, so their land shows as "no state recorded". That is the source's scope, not empty land.
- **Source modelling shows through.** In 31 BCE Cliopatria draws Antony's eastern provinces, Greece included, as the Ptolemaic Kingdom; the chart shows the same.
- **Wikidata and Wikipedia disagree on one day:** the Battle of Arausio is 5 October 105 BCE on Wikidata and 6 October in the English article. The card says so.
- **Participants** are Wikidata's labels in English, uneven in detail (some battles list commanders, some only the sides).
- **Army movements are not shown.** No source we use has them; a route between battles would be invented.
- One theme (light), keyboard and pointer only; tested in Chrome with software WebGL.
