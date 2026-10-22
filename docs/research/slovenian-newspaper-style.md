# Slovenian stories in a newspaper style

**Question.** When a story has no Slovenian Wikipedia article, its summary will be translated. How do we make that translation read like a Slovenian newspaper (Delo, Večer) rather than like translated English, and are there skills, plugins or tools that do this?

**Answer.** No ready-made skill, plugin or connector writes Slovenian in a newspaper register. The pieces exist separately: Slovenian journalism has a well-described anatomy and style (Korošec, Kalin Golob), the reference works are online (Fran, Termania, the exonym dictionary, the Gigafida corpus), and DeepL and Slovenian research tools translate English to Slovenian. The right tool is our own translation skill that writes to a Slovenian style sheet, checks its names against our glossary, and leaves every text marked as an AI translation for review. The style sheet is below.

## What exists

| Kind | Option | Fit |
|---|---|---|
| Claude plugins | Proofread (installed) | Translation review that protects quotations and placeholders. Its linter (Harper) is English-only, so Slovenian review is by reading. |
| | Writing Skills: `journalism-ap` | AP Stylebook, English. The wrong conventions for Slovenian. |
| | Skills on this account | None for Slovenian or translation. |
| Connectors | DeepL | Translates English ↔ Slovenian. **DeepL Write does not support Slovenian** ([specification](https://www.deepl.com/en/pro-service-specifications)), so it cannot polish style. Useful as a second draft to compare. |
| | LILT, Smartling | Human-verified translation; paid. For a reviewed sample, not the whole set. |
| Slovenian tools | [Slovenščina.eu services](https://storitve.cjvt.si/en) (CJVT, University of Ljubljana) | Web tools: English–Slovene translation, named-entity recognition, summarisation. No documented public API. |
| | RSDO translator, open ([model](https://www.clarin.si/repository/xmlui/handle/11356/1736?show=full), [REST service](https://www.clarin.si/repository/xmlui/handle/11356/1739?show=full)) | The engine of the Slovenščina.eu translator: NeMo models in both directions, Apache 2.0, about 4 GB. The service takes up to 5,000 characters per request (about 200 s on 24 CPU cores). Reported to do poorly outside its training domains ([Vajda et al.](https://arxiv.org/html/2508.14951v1)). |
| | [GaMS3-12B-GRPO-Translator](https://huggingface.co/cjvt/GaMS3-12B-GRPO-Translator) (UL FRI) | English→Slovene translation model on Gemma 3 12B (Gemma licence). Needs a GPU; can be served with vLLM behind an OpenAI-compatible API. Its base, GaMS3-12B-Instruct, scores 0.700 COMET on EN→SL against Gemini 2.5 Flash's 0.718 ([paper](https://arxiv.org/pdf/2603.01691)). GaMS Instruct models are hosted by [Featherless](https://featherless.ai/models/cjvt/GaMS-9B-Instruct); the Translator is not listed there. |
| | [Amebis](https://en.wikipedia.org/wiki/Amebis): Besana, Termania | Besana is a Slovenian grammar checker; Termania is a portal of 135+ dictionaries. Desktop and web, no API we could use. |
| | Hunspell `dictionary-sl` | Spelling only; tested in this project (flags misspellings, needs an allowlist for names). |
| References | [Fran and Jezikovna svetovalnica](https://isjfr.zrc-sazu.si/en/programi-in-projekti/language-portals-for-everything-fran-francek-terminologisce-jezikovna) (ZRC SAZU) | SSKJ, Slovenski pravopis, and answered language questions: the authority when a usage is in doubt. |
| | [Gigafida 2.2](https://gigafida22-host.cjvt.si/en/about) | 1.16 billion words of written Slovene, built from daily news, magazines and books. Shows how Slovenian papers actually phrase something. |
| | Exonyms and country names (ZRC SAZU, [GIAM](https://giam.zrc-sazu.si/en/programi-in-projekti/names-of-countries)) | Standard Slovenian names of countries and places (Benetke, Dunaj, Carigrad). |

LanguageTool's public service was not reachable from the build environment, and we could not confirm its Slovenian rules. Neither are CJVT's, Slovenščina.eu's or Hugging Face's hosts: a Slovenian engine would run on our own machine or server, called by the build script.

## How a Slovenian newspaper builds a story

**The headline block (naslovje).** Slovenian journalism names the parts of the head of an article as *nadnaslov* (overline), *veliki naslov* (headline), *podnaslov* (subhead) and *vodilo* (the lead summary, also called *sinopsis*) ([Kalin Golob, *Novinarstvo na prelomnicah*](https://ebooks.uni-lj.si/ZalozbaUL/catalog/download/778/1163/11759?inline=1), after Korošec's *Stilistika slovenskega poročevalstva*, 1998). Korošec separates the headline's informing function from its *pozivno-pridobivalna* (attention-seeking) one, which often works against informing; online this becomes the *klikolovnik*, the clickbait headline. A practical guide adds: the head is *glavni naslov, podnaslov in vodilo, lahko pa tudi nadnaslov*; the lead answers *kdo, kaj, kje, kdaj, zakaj, kako*; the body follows the *obrnjena piramida* (inverted pyramid) ([guide](https://dev.evropskasredstva.si/app/uploads/2025/09/Kako-pripraviti-dober-novinarski-clanek.pdf)).

**Headlines today.** On Večer's front page (22 October 2026): sentence case; section labels in capitals (SLOVENIJA, SVET) and occasional kickers in capitals and brackets; frequent *topic: clause* headlines ("Pravosodje in politika: Kdo ima zadnjo besedo o sodnikih?"); often two short sentences instead of one long one. Print headlines lean on nouns, web headlines on verbs (Kalin Golob). Delo's site refused automated reading, so it is described here from the literature only.

**History told as news.** RTV Slovenija's [*1920* archive](https://www.rtvslo.si/1920/arhiv) retold events a hundred years on: a topic label above the headline (Kemija, Dediščina), an anniversary hook in the lead ("na današnji dan pred 100 leti"), and the narrative in the past tense. It is the closest Slovenian precedent for our drawer.

**Hedging.** Slovenian reporting marks unverified claims with *naj bi* + participle ("naj bi ukradel"); Korošec treats it as a mood of its own in journalism ([review](https://srl.si/sql_pdf/SRL_2001_1-2_8.pdf)). In our stories it belongs only where the English source hedges ("reportedly", "is said to", "according to legend").

## How Slovenian Wikipedia reads

The drawer shows native Slovenian summaries next to translated ones, so the translations should not sound like a different publication. Three history articles were read (others refused automated reading): [*Habsburška monarhija*](https://sl.wikipedia.org/wiki/Habsburška_monarhija), [*Sveto rimsko cesarstvo*](https://sl.wikipedia.org/wiki/Sveto_rimsko_cesarstvo) and [*Bizantinsko cesarstvo*](https://sl.wikipedia.org/wiki/Bizantinsko_cesarstvo). All three are written natively, not translated from English.

- **Lead formula.** Name, an alternative with *ali*, the original in brackets with its language, then a past-tense definition and a *ki*-clause: "Sveto rimsko cesarstvo (latinsko: Sacrum Romanum Imperium) je bila naddržavna, multinacionalna skupnost, ki je …"; "Bizantinsko cesarstvo ali Vzhodno rimsko cesarstvo je bil vzhodni od dveh delov, na katere je razpadlo Rimsko cesarstvo."
- **Sentences.** Long and subordinated (20–25 words on average), nominal (*ustanovitev*, *ukinitev*), formal. Historians' views are attributed and hedged ("običajno razmejujemo", "nekateri zgodovinarji").
- **Conventions.** "leta 962"; "v 18. stoletju"; "11. maj 395" in infoboxes; rulers with a full stop after the numeral (Oton I., Karel V.); Slovenian names of rulers where they exist (Karel Veliki); foreign institutions kept with a gloss (Reichstag); Slovenian place names with the original alongside.
- **Weak spots.** Few footnotes (2–6 in long articles), an occasional English label left in an infobox, a few stiff phrases ("Na Wolfa samega je vplivala …"), and abbreviated ranges ("1624-56") where the norm wants "1624–1656".

**What follows for translations.** Keep the encyclopedia's first sentence — the definition with *je bil/bila … ki* — so a translated summary opens like a native one. After it, write the newspaper way: shorter sentences, verbs rather than nouns, one idea per sentence. Our own parts (kicker, dateline, standfirst) carry the newspaper voice in full.

## Style sheet for our Slovenian stories

**Anatomy.** Our parts already match the newspaper's: kicker = *nadnaslov* (DRŽAVA, BITKA), headline = *naslov*, standfirst with dateline = *vodilo*, summary = *jedro*, facts = *okvirček* (box). Keep the headline the record's name: the drawer is a reference, and an informative headline is the newspaper's own first rule. No *klikolovnik*.

**Dateline.** Slovenian papers open the first paragraph with the place and a dash ("Ljubljana –"). Ours can follow: "SLOVENIJA, 1516–1805 –" in place of the full stop.

**Sentences.**
- Past tense (*perfekt*) for narration; present only for what is still true ("ozemlje, ki ga danes obsega Slovenija").
- Short sentences, one fact each; verbs rather than chains of nouns (*samostalniški slog*).
- Active voice where English uses the passive for a known agent: "Turki so oblegali Dunaj", not "Dunaj je bil oblegan s strani Turkov".
- Neutral register. No evaluative adjectives the source does not have.

**Calques to avoid** (frequent in translated text and long discouraged by Slovenian language advice):

| Avoid | Write |
|---|---|
| *s strani* (agent of a passive) | an active sentence |
| *se nahaja* | *je, leži, stoji* |
| *v kolikor* | *če* |
| *le-ta* | *ta, ta država* |
| *preko* (across, via) | *prek* |
| *kateri* as a plain relative | *ki* |
| *pozno v dnevu* (late in the day) | *proti večeru* |
| *linija se je zlomila* (the line broke) | *bojna vrsta je razpadla* |
| *je bil ubit* (in battle) | *je padel* |
| *preko 100 ladij* | *več kot 100 ladij* |
| *skozi stoletja* | *v teh stoletjih, stoletja dolgo* |
| *kot rezultat* | *zato, zaradi tega* |
| *v primeru, da* | *če* |
| *izvesti napad, nuditi pomoč* | *napasti, pomagati* |

**Grammar that English pulls the wrong way.**
- *svoj*, not *njegov*, for the subject's own: "Karel je cesarstvo razdelil med svoje sinove."
- No articles and no needless subject pronouns: "je bil pomemben vladar", not "on je bil en pomemben vladar".
- Clitics (*je, se, so, ga, mu*) sit in second place; a sentence never starts with one.
- Aspect carries meaning: *so osvojili* (done once) against *so osvajali* (over years). English "would" for habit becomes the imperfective.
- Two of anything take the dual: *obe vojski sta se umaknili*.
- English past perfect becomes the ordinary past (*perfekt*); the old pluperfect (*je bil napadel*) is out.
- Titles are lowercase before a name: *kralj Harold*, *cesar Karel V.*, *papež Leon III.*; peoples are capitalised, their adjectives not (*Turki*, *turški*).
- Prefer the active with an implied subject to the long passive: *Mesto so ustanovili Rimljani*, *grad so porušili*.

**What translation research adds.** Studies of English→Slovene translation, and of translated Slovene against original Slovene, point at the same weak places:

- **Passives.** Slovenian translators keep far fewer English passives than Swedish ones and turn the agented passive into an active sentence, putting the agent last so the English focus survives: "Dragonbone bows are greatly prized by the Dothraki" → "Loke iz zmajevine še posebej častijo Dothraki" ([Čibej & Orel Kos](https://ebooks.uni-lj.si/ZalozbaUL/catalog/download/20/79/823?inline=1)). For us: "Vienna was besieged by the Ottomans in 1529" → "Dunaj so leta 1529 oblegali Turki".
- **Word order.** Both languages put given information before new and the news at the end; Slovene moves English mid-sentence adverbials to the front as a frame, and word order should change only for a reason ([Limon](https://ebooks.uni-lj.si/ZalozbaUL/catalog/download/20/79/822?inline=1)). For us: time and place first ("Leta 1529 …"), the new fact last.
- **Connectives.** Translators add the explanatory *namreč* where English has none (about half of its uses in translations), and *namely* is never its source; it renders causal *for* ("For it is plain that …" → "Očitno je namreč, da …") ([Hirci](https://ebooks.uni-lj.si/ZalozbaUL/catalog/download/25/68/687?inline=1)). For us: *namreč* for "for/because" explanations; "namely" → *in sicer*, *to je*.
- **Interference in plain words.** Translated Slovene uses *človek* about 20 % less than original Slovene; generic English *one/you* and ascriptive "a good man" are where it shows ([Pisanski Peterlin](https://ebooks.uni-lj.si/ZalozbaUL/catalog/download/25/68/688?inline=1)). For us: "he was a capable man" → "bil je sposoben človek"; "10,000 men" (troops) → "10.000 mož".
- **Participles.** Slovene rarely uses participial forms (*-č, -e, -aje*); they appear under a foreign original's influence, and translators turn them into clauses ([Horvat](https://ebooks.uni-lj.si/ZalozbaUL/catalog/download/109/200/2359?inline=1), on French). For us: "Crossing the river, the army …" → "Ko je vojska prečkala reko, …", not "Prečkajoč reko …".
- **Machine translation.** In the European Commission's review of its English→Slovene engine, mistranslation and unclear sentences made up about 70 % of marked errors, ahead of grammar and terminology: wrong relations behind prepositions ("requirements on SMEs" → "zahteve MSP"), abbreviations in the wrong gender, untranslated titles, source-like sentence structure; no sample was fit to publish ([Arnejšek & Unk 2020](https://aclanthology.org/2020.eamt-1.41.pdf)).

**Titles and epithets.** English "X of Y" becomes a Slovenian adjective: "Duke of Normandy" → *normandijski vojvoda*, "King of England" → *angleški kralj*, "Counts of Celje" → *celjski grofje*; epithets take their established form (*Veliki, Osvajalec, Lepi*).

**False friends** (well-known pairs): *eventually* → *sčasoma, nazadnje* (not *eventualno*); *actual* → *dejanski* (not *aktualen*); *evidence* → *dokazi, viri* (not *evidenca*); *sympathetic to* → *naklonjen* (not *simpatičen*); *realise* → *spoznati, ugotoviti* (not *realizirati*); *dramatic* → *korenit, silovit*.

**Dates and numbers** (Slovenski pravopis): "14. oktobra 1066", "v 16. stoletju", "v 1620. letih", "27 pr. n. št.", "ok. 1200", "100.000 km²", "62 %". Numbers agree with the noun in four forms (1 država, 2 državi, 3 države, 5 držav).

**Names.**
- Places and states take their established Slovenian names: Benetke, Dunaj, Carigrad, Oglej, Celovec, Trst; check the exonym dictionary and the standard country names before inventing a form.
- Descriptive names of events are lowercase in running text: *bitka pri Hastingsu*, *druga svetovna vojna*, *francoska revolucija*. A Wikipedia title capitalises the first letter only because it is a title.
- People: established Slovenian forms where they exist (Viljem Osvajalec, Karel Veliki); otherwise the original, transcribed by the Pravopis rules for non-Latin scripts.
- The project's own glossary (`src/i18n/names/sl.json`) wins over a fresh translation, so a state has the same name on the chart and in its story.

**Quotation marks** »…«.

**Licence and labelling.** A translated summary is an adaptation of CC BY-SA text: it keeps the licence, cites the English article and revision, says it is a translation, and carries the AI-translation mark in the drawer until a person has reviewed it.

## Example

From the test fixture (our own paraphrase of the Battle of Hastings):

> **EN** Harold was killed late in the day and the English line broke. The victory opened the Norman conquest of England; William was crowned king in Westminster on Christmas Day of the same year.

> **Literal** Harold je bil ubit pozno v dnevu in angleška linija se je zlomila. Zmaga je odprla normansko osvojitev Anglije; Viljem je bil kronan za kralja v Westminstru na božični dan istega leta.

> **Newspaper** Harold je padel proti večeru in angleška bojna vrsta je razpadla. Z zmago se je začela normanska osvojitev Anglije: Viljem je bil na božič istega leta v Westminstru kronan za kralja.

## Workflow

1. Draft with the translation skill, given the English summary, the record's names from the glossary and the style sheet.
2. Self-check against the calque table, dates, names and agreement after numbers.
3. Spellcheck with `dictionary-sl`, with the glossary as an allowlist.
4. When a phrasing is in doubt, look it up in Gigafida (how papers write it) and Fran (what the norm says).
5. Publish with the AI-translation mark. Review a sample by a native speaker first, then the most-read stories.
