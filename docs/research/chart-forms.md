# Which chart form for an interactive history wall chart

**Question.** On this chart every block is also a control: it must say what it is, and it must be big enough to select, at every zoom. Is the current form (time down, one column per country, a block per state) the right one, or is there a better chart for a history app?

**Answer.** Keep the form. It is the one that serves the app's core task — *compare who held each country at the same moment* — and the readability problems are in the blocks, not the layout. Fix the blocks: a minimum target width, a label ladder that never defaults to rotated text, and focus + context while a story is open. Add a horizontal single-country view later, for reading one country in depth.

## The forms compared

| Form | What it encodes | Fit for this app |
|---|---|---|
| **Synchronoptic wall chart** (current; Adams 1871, UsefulCharts) | Time on one axis, one column per country, a block per state | **Keep.** A faceted, linear, chronological timeline: the layout made for comparing parallel series ([Brehmer et al.](https://aviz.fr/~bbach/timelines/Brehmer2016timelines.pdf)). Vertical time suits phones (scroll down through time) and the poster everyone recognises. Weakness: narrow columns squeeze labels. |
| **Histomap** (Sparks 1931) | Stream width = "relative power" | **Reject.** Width has no defined measure and the chart is criticised for a Western bias ([Visual Capitalist](https://visualcapitalist.com/histomap/)). Our share-of-today's-country tiers are the defensible version of the same idea. |
| **Horizontal Gantt / flame chart** | Time across, one row per lane, labels inside bars | **Later, as a country view.** Labels read along the bar, the most legible arrangement. But with 192 lanes as rows it scrolls vertically forever, it fights portrait phones, and a right-hand drawer would cover recent time instead of other countries. Ideal for one country in depth. |
| **Map with a time slider** (Cliopatria's viewer, GeaCron) | Space, one year at a time | **Complement, not replace.** Shows where, but not who came before and after, which is the poster's point. |
| **Proportional columns** (column width by area) | Country size | **Reject.** Russia would fill the screen and Luxembourg would vanish; the unit of comparison is the country, so equal widths are right. |
| **Icicle / sunburst** | A hierarchy | **Reject.** Polities are not a clean tree (realms, vassals, unions, splits). |

## Findings that shape the blocks

1. **Rotated text is slow.** In a controlled reading study, horizontal text was read at about 2.95 words a second against 1.73 reading upwards and 1.57 reading downwards, roughly 41–47 % slower ([Leeds/White Rose, 2020](https://eprints.whiterose.ac.uk/id/eprint/164257/)). Rotated labels stay as the last rung of the label ladder, for tall narrow blocks only.
2. **Targets need 24 × 24 px.** WCAG 2.2 SC 2.5.8 (AA) sets 24 CSS px as the minimum pointer target, unless spacing compensates ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). Side-by-side sub-columns now stop at that width; the rest gather into one "+N" block.
3. **Overview first, zoom and filter, then details on demand** ([Shneiderman 1996](https://drum.lib.umd.edu/items/155a868e-fb83-4115-9899-9187ea8c0498/full)). The four levels are the overview and zoom; the story drawer is "details on demand".
4. **Keep the zoom levels few and visible.** ChronoZoom's designers found that beyond about three nested timelines readers lost track of how each level related to the one before ([ChronoZoom](https://www.sociostudies.org/almanac/articles/from_concept_to_reality_developing_a_zoomable_timeline_for_big_history)). The app keeps four levels with the level control and the legend naming the current one.
5. **Faceted layouts need pan and zoom** at this scale (Brehmer et al., §4.4.3). The app has both; the drawer must not take them away, so it covers the chart without resizing it and the columns can scroll out from under it.

## What changed in this version

| Change | Why |
|---|---|
| Sub-columns capped at 24 px; overflow gathered into "+N" blocks that open a list story | Finding 2: every block is a usable target and says something ("+3", "3 states") |
| Label ladder kept — wrapped horizontal (up to 3 lines) → one truncated line → rotated only for blocks ≥ 72 px tall — with "+N" added as the last rung | Finding 1 |
| Selecting a block opens its story; the story's column is framed and kept in view, the others fade to about 40 % | Focus + context: the country you chose from stays the subject |
| One selection instead of three highlight colours | One concept, one state: what you are reading is what is highlighted |

## Next

- **Country view**: a horizontal flame chart of one country, offered when the drawer is at full width on a wide screen, or from a column header. Labels then run along their bars (finding 1).
- **Usability test** with five readers, before and after, on tasks such as "Who held Slovenia when the Battle of Hastings was fought?" and "Follow the Habsburg monarchy across Europe in 1700". Measure time on task and misclicks.
