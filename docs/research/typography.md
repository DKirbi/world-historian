# Type for the story drawer

**Question.** The story drawer is read like a newspaper page, in English and Slovenian, about every period and place on the chart. Which faces should set it? The Caslon pair read as old and calligraphic, and its italics carried too much of the page.

**Answer.** A slab for the loud parts, a screen text serif for reading, and the chart's condensed sans for data:

| Role | Face | Where |
|---|---|---|
| Headline, kicker, dateline, section labels, drop cap | **Roboto Slab** (variable, 400–700) | `--font-headline` |
| Standfirst, summary, points of view | **Literata** (variable, optical size 7–72, 400–700, italic 400) | `--font-story` |
| Facts, provenance, captions, citation marks | IBM Plex Sans Condensed (unchanged) | `--font-ui` |

Labels are tracked capitals of the slab, not italics or small caps. Italics remain only where the quoted text has them.

## What wikis and newspapers do

- **Wikipedia** sets body text in the reader's system sans and headings in a serif stack: Codex's `font-family-serif` is `'Linux Libertine', 'Georgia', 'Times', 'Source Serif 4', serif` ([Codex design tokens](https://doc.wikimedia.org/codex/latest/design-tokens/font.html)). Because the stack depends on what is installed, headings rendered differently from platform to platform, and non-Latin languages were switched to sans headings ([T73240](https://phabricator.wikimedia.org/T73240)). Lesson: ship the web fonts, and test their coverage against the text you actually show.
- **The Guardian** has set its headlines in a slab since its 2005 redesign: Guardian Egyptian, by Paul Barnes and Christian Schwartz, a family with matching text, sans and agate cuts ([Wikipedia](https://en.wikipedia.org/wiki/Guardian_Egyptian)). A slab headline over a quieter text face is a newspaper convention, not a novelty.
- **Reading speed** depends more on the reader than the font. In a study of 352 readers and 16 fonts, the same person read up to 35 % faster in their fastest font than their slowest. No font was best for everyone, people's favourite was not their fastest, and comprehension did not change ([Wallace et al., ACM TOCHI 2022](https://jeffhuang.com/papers/Readability_TOCHI22.pdf)). So: choose a well-made screen face, set it generously (17–18 px, line height 1.6, about 65 characters), and consider a reader font setting later rather than hunting for one ideal face.

## The candidates for text

Each was set under a Roboto Slab headline in the drawer's sizes, in Slovenian ([specimen](typography-specimen.png)).

| Face | Made for | Notes |
|---|---|---|
| **Literata** (TypeTogether) | Google Play Books; "a distinct variable font family for digital text" ([repo](https://github.com/googlefonts/literata)) | Sturdy, low-contrast serifs that echo the slab. Optical sizes. The widest script coverage of the four. |
| Source Serif 4 (Adobe) | Text in many sizes, companion of Source Sans; five optical sizes ([Adobe](https://blog.adobe.com/en/publish/2021/03/04/source-serif-gets-optical-sizes)) | A close second. Lighter on screen; no polytonic Greek. |
| Newsreader (Production Type) | Google Fonts commission "for on-screen, longer-form reading" ([Production Type](https://productiontype.com/family/newsreader)) | The most newspaper-like, but it sets small at 17 px and covers only Latin and Vietnamese. |
| Roboto Serif (Commercial Type) | "Designed to work alongside Roboto for interfaces and immersive reading" ([repo](https://github.com/googlefonts/roboto-serif)) | The family match on paper, but wide (fewer words per line) and has no Greek. |

## Coverage

Every character in the chart's names (states, events, eras, in English and Slovenian) and both catalogues — 10,488 strings, 161 characters — was checked against each font's character map (all subsets, regular weight). The summaries come from Wikipedia, so the scripts and transliterations history articles use were checked as well.

| | Chart text | Greek | Polytonic | Cyrillic | Arabic, Sanskrit translit. | Pinyin tones | ʻokina | Vietnamese |
|---|---|---|---|---|---|---|---|---|
| Libre Caslon (before) | 8 missing, in 13 names | – | – | – | partial | – | – | – |
| **Roboto Slab** | ʻokina only (3 names) | ✓ | – | ✓ | – | – | – | ✓ |
| **Literata** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Source Serif 4 | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| Newsreader | ʻokina only | – | – | – | – | – | – | ✓ |
| Roboto Serif | ✓ | – | – | ✓ | ✓ | partial | ✓ | ✓ |

Literata is second in the headline stack, so the one glyph Roboto Slab lacks (the ʻokina in *Tuʻi Tonga*) comes from the text face instead of a system font. IPA is incomplete in all of them; it falls back to the system.

## Details

- **No small caps.** Neither Literata nor Roboto Slab has `smcp` in the Google Fonts build, and browsers fake small caps by shrinking capitals, which looks thin. The dateline and labels use real capitals of the slab at 0.75–0.8 em with 0.06–0.07 em tracking.
- **Weights.** Headline 700 in the side drawer, 600 at full width where it sets up to 68 px. Labels 600.
- **Optical size.** Literata is loaded with its `opsz` axis; `font-optical-sizing: auto` (the default) picks the text cut for the summary and a tighter one for the standfirst.
- **The chart keeps IBM Plex Serif** for its title, the year in the corner and the year field. Roboto Slab has only proportional figures (no `tnum`), so a year counter set in it would shift as the digits change.
- **Loading.** One Google Fonts request: `Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400` and `Roboto+Slab:wght@400..700`, with `display=swap`. The fallbacks (Source Serif 4, Georgia) have similar proportions, so the swap moves little text.

## Next

- A reader setting for text size (and perhaps a sans alternative), following the finding that the best font differs per reader.
- Check the summary at 200 % zoom and in Windows High Contrast once the live Wikipedia text is in.
