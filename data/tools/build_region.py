"""Build one region of the world-history timeline from Cliopatria.

Usage:
  python3 -I build_region.py <region> <cliopatria.geojson> <ne_50m_admin_0_countries.geojson> <out_dir>
  region: europe | americas | oceania | africa-middle-east | asia

Inputs
  Cliopatria v0.2.1 (Seshat Global History Databank), CC BY 4.0
  Natural Earth 1:50m Admin 0 countries, public domain

Method (deterministic; no hand-entered dates or names)
  1. Lanes = modern country polygons from Natural Earth, clipped to the region box
     (plus optional per-lane clips, e.g. French Guiana cut from France).
  2. Entity = Cliopatria polity name without the "(...)" realm wrapper + its
     Wikidata id. A gap of more than SPLIT_GAP years between rows splits an
     entity into separate incarnations. Ids are computed on the whole dataset, so
     a polity has the same id in every region.
  3. Every Cliopatria POLITY row is intersected with every lane in an equal-area
     projection (EPSG:6933): share = overlap km2 / lane km2.
  4. Realm rows ("(Kingdom of France)" = polity + vassals) only raise the share in
     years where the core polity has rows; they never extend its time span.
  5. A year counts for a lane when either
       a. share >= the lane's minShare = max(MIN_SHARE, NOISE_KM2 / lane km2), capped
          at 0.5 (absorbs border misalignment in small lanes), or
       b. at least INSIDE_FRAC of the polity's own land (its polygon clipped to Natural
          Earth land, since island and coastal polygons include sea) lies in the lane and the
          overlap is >= INSIDE_MIN_KM2, or at least INSIDE_SMALL_FRAC lies in it with
          >= INSIDE_SMALL_KM2 of overlap ("inside" rule: keeps small polities such as
          city-states that sit wholly inside a very large modern country), or
       c. the overlap is >= TIER2_KM2 (a foothold that large is never border noise,
          e.g. early colonial New South Wales inside today's Australia).
     Island lanes (option "islands") have no land borders to misalign, so they use
     MIN_SHARE without the NOISE_KM2 floor.
     Lanes that end up with no spans are left out and listed as omittedLanes.
     Spans are runs of counted years, bridging gaps up to GAP_TOL years; years counted
     by share and years counted only by rules b or c never share a run. Spans
     shorter than MIN_YEARS are dropped unless their peak share >= KEEP_SHORT_PEAK or
     they held >= TIER2_KM2 of the lane (short but large: e.g. the Confederate States).
  6. Tier: 1 = peak share >= 0.5; 2 = peak share >= 0.2 or peak overlap >= TIER2_KM2;
     3 = the rest (detail).
  7. Span edges inherit Cliopatria's map snapshot years, which can sit a few years
     off the textbook dates. They are not corrected here.

Cited layers (enrich.py, from the Wikidata snapshots in <out_dir>/sources/; skipped if absent)
  8. Each polity gets a checked Wikidata link ("wd"): Cliopatria's own id when its dates
     plausibly cover the polity's years, else the item of its Wikipedia title, else none
     (flagged). Wikidata's dates are recorded beside the chart's, never replacing them.
  9. Supplement states (sources/supplement.json): states the source does not map, with
     Wikidata (or quoted Wikipedia) dates, placed in one lane and marked extent "unknown".
 10. Key events (sources/wikidata-events.json): placed by coordinates, location or country.
"""
import sys, json, re, os, unicodedata
from collections import defaultdict, Counter
import geopandas as gpd, shapely
from shapely.geometry import box
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enrich  # noqa: E402
import cultures  # noqa: E402
import eras as eras_mod  # noqa: E402
import link_fixes  # noqa: E402

GENERATED = "2026-10-17"
SOURCE = {
    "id": "cliopatria",
    "title": "Cliopatria: a geospatial database of world-wide political entities from 3400BCE to 2024CE",
    "version": "v0.2.1",
    "url": "https://github.com/Seshat-Global-History-Databank/cliopatria",
    "doi": "10.1038/s41597-025-04516-9",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "authors": "Seshat Global History Databank team (full author list in the paper at the DOI)",
    "changes": "Polygons intersected with modern country borders to derive per-country spans; names and years otherwise unchanged.",
}
WIKIDATA = {
    "id": "wikidata",
    "title": "Wikidata",
    "url": "https://www.wikidata.org",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "retrieved": "2026-10-17",
    "changes": "Snapshot of item labels, dates, coordinates and countries (data/sources/wikidata-*.json); "
               "used for the link check, the supplement states and the key events.",
}
WIKIPEDIA = {
    "id": "wikipedia",
    "title": "Wikipedia (English)",
    "url": "https://en.wikipedia.org",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "retrieved": "2026-10-17",
    "changes": "Short quotations cited for dates and places Wikidata lacks (data/sources/supplement.json).",
}
BORDERS = {
    "id": "natural-earth",
    "title": "Natural Earth 1:50m Admin 0 – Countries",
    "url": "https://github.com/nvkelso/natural-earth-vector",
    "license": "Public domain",
}

MIN_SHARE, NOISE_KM2, GAP_TOL, MIN_YEARS, KEEP_SHORT_PEAK, SPLIT_GAP = 0.05, 500, 1, 10, 0.5, 50
INSIDE_FRAC, INSIDE_MIN_KM2, TIER2_KM2 = 0.5, 1000, 100_000
# Small polities almost wholly inside one lane (city-states, free cities, principalities)
INSIDE_SMALL_FRAC, INSIDE_SMALL_KM2 = 0.8, 100

# ----------------------------------------------------------------------------- regions
# Lane tuple: (id, Natural Earth ADMIN names merged into it, label, group, options)
# options: {"within": box} keeps only that part, {"without": box} removes that part.
EXCLUDED = {
    "europe": [
        {"id": "liechtenstein", "label": "Liechtenstein", "naturalEarth": ["Liechtenstein"],
         "reason": "At this map scale the neighbouring Swiss and earlier polygons cover all of Liechtenstein, so the "
                   "column would show Switzerland ruling it; the source's Principality of Liechtenstein (1721–1814) "
                   "barely overlaps the modern border."},
    ],
    "americas": [
        {"id": "falkland-islands", "label": "Falkland Islands (Islas Malvinas)", "naturalEarth": ["Falkland Islands"],
         "reason": "The source maps British rule continuously from 1769. Britain left Port Egmont in 1774, Spain withdrew "
                   "from Puerto Soledad in 1811, the United Provinces of the Río de la Plata claimed the islands from 1820, "
                   "and Britain reasserted control in January 1833. Left out until a cited correction layer exists.",
         "source": "https://en.wikipedia.org/wiki/Reassertion_of_British_sovereignty_over_the_Falkland_Islands_(1833)"},
    ],
    "africa-middle-east": [
        {"id": "reunion", "label": "Réunion (France)", "naturalEarth": ["France (part)"],
         "reason": "An overseas department of France. The source has no state specific to the island, only French "
                   "colonial records under other names (French India, French Indochina)."},
        {"id": "seychelles", "label": "Seychelles", "naturalEarth": ["Seychelles"],
         "reason": "The source's polygons are offset from the islands (about 10% overlap at this map scale), so the "
                   "column's shares would be unreliable."},
    ],
}

REGIONS = {
    "europe": {
        "box": box(-32, 34, 60, 72),
        "periods": [
            ("ancient", "Bronze & Early Iron Age", -3400, -801),
            ("classical", "Classical Antiquity", -800, 475),
            ("early-medieval", "Early Middle Ages", 476, 999),
            ("high-medieval", "High Middle Ages", 1000, 1299),
            ("late-medieval", "Late Middle Ages", 1300, 1491),
            ("early-modern", "Early Modern", 1492, 1788),
            ("modern", "Long 19th Century", 1789, 1913),
            ("contemporary", "Contemporary", 1914, 2024),
        ],
        "periodNote": "Conventional European periods, used as editorial bins for loading and navigation.",
        "lanes": [
            ("portugal", ["Portugal"], "Portugal", "iberia", {}),
            ("spain", ["Spain"], "Spain", "iberia", {}),
            ("andorra", ["Andorra"], "Andorra", "iberia", {}),
            ("france", ["France"], "France", "western", {}),
            ("ireland", ["Ireland"], "Ireland", "british-isles", {}),
            ("united-kingdom", ["United Kingdom"], "United Kingdom", "british-isles", {}),
            ("isle-of-man", ["Isle of Man"], "Isle of Man", "british-isles", {}),
            ("belgium", ["Belgium"], "Belgium", "low-countries", {}),
            ("netherlands", ["Netherlands"], "Netherlands", "low-countries", {}),
            ("luxembourg", ["Luxembourg"], "Luxembourg", "low-countries", {}),
            ("switzerland", ["Switzerland"], "Switzerland", "central", {}),
            ("germany", ["Germany"], "Germany", "central", {}),
            ("austria", ["Austria"], "Austria", "central", {}),
            ("czechia", ["Czechia"], "Czechia", "central", {}),
            ("slovakia", ["Slovakia"], "Slovakia", "central", {}),
            ("poland", ["Poland"], "Poland", "central", {}),
            ("hungary", ["Hungary"], "Hungary", "central", {}),
            ("italy", ["Italy"], "Italy", "italy", {}),
            ("malta", ["Malta"], "Malta", "italy", {}),
            ("slovenia", ["Slovenia"], "Slovenia", "balkans", {}),
            ("croatia", ["Croatia"], "Croatia", "balkans", {}),
            ("bosnia-and-herzegovina", ["Bosnia and Herzegovina"], "Bosnia and Herzegovina", "balkans", {}),
            ("serbia", ["Republic of Serbia"], "Serbia", "balkans", {}),
            ("kosovo", ["Kosovo"], "Kosovo", "balkans", {}),
            ("montenegro", ["Montenegro"], "Montenegro", "balkans", {}),
            ("albania", ["Albania"], "Albania", "balkans", {}),
            ("north-macedonia", ["North Macedonia"], "North Macedonia", "balkans", {}),
            ("greece", ["Greece"], "Greece", "balkans", {}),
            ("bulgaria", ["Bulgaria"], "Bulgaria", "balkans", {}),
            ("romania", ["Romania"], "Romania", "balkans", {}),
            ("moldova", ["Moldova"], "Moldova", "balkans", {}),
            ("turkey", ["Turkey"], "Turkey (Anatolia & Thrace)", "anatolia", {}),
            ("cyprus", ["Cyprus", "Northern Cyprus"], "Cyprus (island)", "anatolia", {}),
            ("iceland", ["Iceland"], "Iceland", "nordic", {}),
            ("faroe-islands", ["Faroe Islands"], "Faroe Islands", "nordic", {}),
            ("norway", ["Norway"], "Norway", "nordic", {}),
            ("sweden", ["Sweden"], "Sweden", "nordic", {}),
            ("denmark", ["Denmark"], "Denmark", "nordic", {}),
            ("finland", ["Finland"], "Finland", "nordic", {}),
            ("estonia", ["Estonia"], "Estonia", "baltic", {}),
            ("latvia", ["Latvia"], "Latvia", "baltic", {}),
            ("lithuania", ["Lithuania"], "Lithuania", "baltic", {}),
            ("belarus", ["Belarus"], "Belarus", "eastern", {}),
            ("ukraine", ["Ukraine"], "Ukraine", "eastern", {}),
            ("russia", ["Russia"], "Russia (west of 60°E)", "eastern", {}),
        ],
    },
    "americas": {
        "box": box(-170, -57, -10, 84),  # east edge at 10°W keeps all of Greenland
        "periods": [
            ("archaic", "Archaic", -3400, -2001),
            ("preclassic", "Preclassic", -2000, 249),
            ("classic", "Classic", 250, 899),
            ("postclassic", "Postclassic", 900, 1491),
            ("contact", "Conquest & contact", 1492, 1599),
            ("colonial", "Colonial era", 1600, 1774),
            ("independence", "Age of independence", 1775, 1849),
            ("republics", "Late 19th century", 1850, 1913),
            ("contemporary", "Contemporary", 1914, 2024),
        ],
        "periodNote": (
            "Archaic, Preclassic, Classic and Postclassic follow the summary table of Wikipedia's "
            "'Mesoamerican chronology' (3500–2000 BCE, 2000 BCE–250 CE, 250–900, 900–1521); the Postclassic "
            "bin is cut at 1492 so European contact starts one bin for the whole continent. Later bins are "
            "editorial. Andean and North American chronologies use different names and dates."
        ),
        "periodSources": ["https://en.wikipedia.org/wiki/Mesoamerican_chronology"],
        # The Eras level uses these bins only after contact: before it they are Mesoamerican names.
        "binsFrom": 1492,
        "lanes": [
            ("greenland", ["Greenland"], "Greenland", "north-america", {}),
            ("canada", ["Canada"], "Canada", "north-america", {}),
            ("united-states", ["United States of America"], "United States", "north-america",
             {"without": box(-162, 17, -153, 24)}),  # Hawaii belongs with Oceania
            ("mexico", ["Mexico"], "Mexico", "mexico-central", {}),
            ("guatemala", ["Guatemala"], "Guatemala", "mexico-central", {}),
            ("belize", ["Belize"], "Belize", "mexico-central", {}),
            ("el-salvador", ["El Salvador"], "El Salvador", "mexico-central", {}),
            ("honduras", ["Honduras"], "Honduras", "mexico-central", {}),
            ("nicaragua", ["Nicaragua"], "Nicaragua", "mexico-central", {}),
            ("costa-rica", ["Costa Rica"], "Costa Rica", "mexico-central", {}),
            ("panama", ["Panama"], "Panama", "mexico-central", {}),
            ("bahamas", ["The Bahamas"], "Bahamas", "caribbean", {}),
            ("cuba", ["Cuba"], "Cuba", "caribbean", {}),
            ("jamaica", ["Jamaica"], "Jamaica", "caribbean", {}),
            ("haiti", ["Haiti"], "Haiti", "caribbean", {}),
            ("dominican-republic", ["Dominican Republic"], "Dominican Republic", "caribbean", {}),
            ("puerto-rico", ["Puerto Rico"], "Puerto Rico", "caribbean", {}),
            # Island states and territories of the Lesser Antilles, each well under 1,000 km², share one lane.
            ("lesser-antilles", ["Antigua and Barbuda", "Barbados", "Dominica", "Grenada", "Saint Kitts and Nevis",
                                 "Saint Lucia", "Saint Vincent and the Grenadines", "Montserrat", "Anguilla",
                                 "British Virgin Islands", "United States Virgin Islands", "Saint Martin",
                                 "Sint Maarten", "Saint Barthelemy", "Aruba", "Curaçao",
                                 ("Netherlands", box(-69, 11.9, -62.8, 17.7), "Caribbean Netherlands"),
                                 ("France", box(-62, 14.2, -60.7, 16.6), "Guadeloupe & Martinique (France)")],
             "Lesser Antilles", "caribbean", {}),
            ("trinidad-and-tobago", ["Trinidad and Tobago"], "Trinidad and Tobago", "caribbean", {}),
            ("colombia", ["Colombia"], "Colombia", "northern-south", {}),
            ("venezuela", ["Venezuela"], "Venezuela", "northern-south", {}),
            ("guyana", ["Guyana"], "Guyana", "northern-south", {}),
            ("suriname", ["Suriname"], "Suriname", "northern-south", {}),
            ("french-guiana", ["France"], "French Guiana", "northern-south", {"within": box(-55, 1.5, -51, 6.5)}),
            ("ecuador", ["Ecuador"], "Ecuador", "andes", {"without": box(-93, -2, -88, 2)}),  # Galápagos
            ("peru", ["Peru"], "Peru", "andes", {}),
            ("bolivia", ["Bolivia"], "Bolivia", "andes", {}),
            ("chile", ["Chile"], "Chile", "andes", {"without": box(-112, -30, -100, -24)}),  # Rapa Nui
            ("brazil", ["Brazil"], "Brazil", "plata", {}),
            ("paraguay", ["Paraguay"], "Paraguay", "plata", {}),
            ("uruguay", ["Uruguay"], "Uruguay", "plata", {}),
            ("argentina", ["Argentina"], "Argentina", "plata", {}),
        ],
    },
}

HAWAII_BOX = box(-162, 17, -153, 24)
RAPA_NUI_BOX = box(-112, -30, -100, -24)
REGIONS["oceania"] = {
    # The Pacific crosses the 180° meridian, so the region box is two halves.
    "box": shapely.union(box(110, -56, 180, 30), box(-180, -56, -105, 30)),
    "periods": [
        ("before-contact", "Before European contact", -3400, 1520),
        ("early-contact", "Early European contact", 1521, 1787),
        ("colonial", "Colonial era", 1788, 1913),
        ("world-wars", "World wars", 1914, 1945),
        ("since-1946", "Since 1946", 1946, 2024),
    ],
    "periodNote": (
        "Editorial bins. 'Before European contact' ends in 1521, when Magellan's expedition reached Guam; "
        "most island groups met Europeans much later. 'Colonial era' starts in 1788, when the First Fleet "
        "reached Sydney Cove."
    ),
    "periodSources": ["https://en.wikipedia.org/wiki/History_of_Guam", "https://en.wikipedia.org/wiki/Australia_Day"],
    "lanes": [
        ("australia", ["Australia"], "Australia", "australia-nz", {}),
        ("new-zealand", ["New Zealand"], "New Zealand", "australia-nz", {}),
        ("papua-new-guinea", ["Papua New Guinea"], "Papua New Guinea", "melanesia", {}),
        ("solomon-islands", ["Solomon Islands"], "Solomon Islands", "melanesia", {"islands": True}),
        ("vanuatu", ["Vanuatu"], "Vanuatu", "melanesia", {"islands": True}),
        ("new-caledonia", ["New Caledonia"], "New Caledonia", "melanesia", {"islands": True}),
        ("fiji", ["Fiji"], "Fiji", "melanesia", {"islands": True}),
        # Small island states are combined so each lane is at least ~1,000 km², as in other regions.
        ("micronesian-islands", ["Federated States of Micronesia", "Palau", "Marshall Islands", "Kiribati", "Nauru",
                                 "Guam", "Northern Mariana Islands"], "Micronesian islands", "micronesia", {"islands": True}),
        ("hawaii", [("United States of America", HAWAII_BOX, "Hawaiʻi (United States)")], "Hawaiʻi", "polynesia", {"islands": True}),
        ("samoa", ["Samoa"], "Samoa", "polynesia", {"islands": True}),
        ("french-polynesia", ["French Polynesia"], "French Polynesia", "polynesia", {"islands": True}),
        ("polynesian-islands", ["Tonga", "Tuvalu", "Cook Islands", "Niue", "American Samoa", "Wallis and Futuna",
                                "Pitcairn Islands", ("Chile", RAPA_NUI_BOX, "Rapa Nui (Chile)")], "Tonga & other islands", "polynesia", {"islands": True}),
    ],
}

REGIONS["africa-middle-east"] = {
    "box": box(-26, -36, 64, 43),
    "periods": [
        ("bronze-age", "Bronze Age", -3400, -1201),
        ("iron-age", "Iron Age", -1200, -540),
        ("classical", "Persian, Hellenistic & Roman era", -539, 631),
        ("caliphates", "Caliphates & sultanates", 632, 1499),
        ("early-modern", "Early modern era", 1500, 1884),
        ("colonial", "Colonial era", 1885, 1956),
        ("independence", "Independence era", 1957, 2024),
    ],
    "periodNote": (
        "Bronze and Iron Age bins follow the Ancient Near East periodization table on Wikipedia (Bronze Age "
        "3300–1200 BCE, Iron Age 1200–539 BCE). The Islamic era starts in 632 with the Rashidun Caliphate. "
        "The colonial bin starts after the Berlin Conference (1884–85) and the independence bin in 1957, when "
        "Ghana became the first sub-Saharan country to gain independence. The cut at 1500 is editorial. "
        "These anchors come from Near Eastern and colonial history; sub-Saharan African history has its own chronologies."
    ),
    "periodSources": [
        "https://en.wikipedia.org/wiki/Ancient_Near_East",
        "https://en.wikipedia.org/wiki/Rashidun_Caliphate",
        "https://en.wikipedia.org/wiki/Scramble_for_Africa",
        "https://en.wikipedia.org/wiki/Decolonisation_of_Africa",
    ],
    "lanes": [
        # Turkey and Cyprus use the same lane definition as in Europe, so their spans are identical.
        ("turkey", ["Turkey"], "Turkey (Anatolia & Thrace)", "anatolia", {}),
        ("cyprus", ["Cyprus", "Northern Cyprus"], "Cyprus (island)", "anatolia", {}),
        ("syria", ["Syria"], "Syria", "levant", {}),
        ("lebanon", ["Lebanon"], "Lebanon", "levant", {}),
        ("israel", ["Israel"], "Israel", "levant", {}),
        ("palestine", ["Palestine"], "Palestine", "levant", {}),
        ("jordan", ["Jordan"], "Jordan", "levant", {}),
        ("iraq", ["Iraq"], "Iraq", "mesopotamia-iran", {}),
        ("iran", ["Iran"], "Iran", "mesopotamia-iran", {}),
        ("saudi-arabia", ["Saudi Arabia"], "Saudi Arabia", "arabia", {}),
        ("kuwait", ["Kuwait"], "Kuwait", "arabia", {}),
        ("bahrain", ["Bahrain"], "Bahrain", "arabia", {}),
        ("qatar", ["Qatar"], "Qatar", "arabia", {}),
        ("united-arab-emirates", ["United Arab Emirates"], "United Arab Emirates", "arabia", {}),
        ("oman", ["Oman"], "Oman", "arabia", {}),
        ("yemen", ["Yemen"], "Yemen", "arabia", {}),
        ("egypt", ["Egypt"], "Egypt", "north-africa", {}),
        ("libya", ["Libya"], "Libya", "north-africa", {}),
        ("tunisia", ["Tunisia"], "Tunisia", "north-africa", {}),
        ("algeria", ["Algeria"], "Algeria", "north-africa", {}),
        ("morocco", ["Morocco"], "Morocco", "north-africa", {}),
        ("western-sahara", ["Western Sahara"], "Western Sahara", "north-africa", {}),
        ("sudan", ["Sudan"], "Sudan", "nile-horn", {}),
        ("south-sudan", ["South Sudan"], "South Sudan", "nile-horn", {}),
        ("eritrea", ["Eritrea"], "Eritrea", "nile-horn", {}),
        ("ethiopia", ["Ethiopia"], "Ethiopia", "nile-horn", {}),
        ("djibouti", ["Djibouti"], "Djibouti", "nile-horn", {}),
        ("somalia", ["Somalia", "Somaliland"], "Somalia", "nile-horn", {}),
        ("mauritania", ["Mauritania"], "Mauritania", "west-africa", {}),
        ("senegal", ["Senegal"], "Senegal", "west-africa", {}),
        ("gambia", ["Gambia"], "Gambia", "west-africa", {}),
        ("cabo-verde", ["Cabo Verde"], "Cabo Verde", "west-africa", {"islands": True}),
        ("guinea-bissau", ["Guinea-Bissau"], "Guinea-Bissau", "west-africa", {}),
        ("guinea", ["Guinea"], "Guinea", "west-africa", {}),
        ("sierra-leone", ["Sierra Leone"], "Sierra Leone", "west-africa", {}),
        ("liberia", ["Liberia"], "Liberia", "west-africa", {}),
        ("cote-d-ivoire", ["Ivory Coast"], "Côte d’Ivoire", "west-africa", {}),
        ("mali", ["Mali"], "Mali", "west-africa", {}),
        ("burkina-faso", ["Burkina Faso"], "Burkina Faso", "west-africa", {}),
        ("ghana", ["Ghana"], "Ghana", "west-africa", {}),
        ("togo", ["Togo"], "Togo", "west-africa", {}),
        ("benin", ["Benin"], "Benin", "west-africa", {}),
        ("niger", ["Niger"], "Niger", "west-africa", {}),
        ("nigeria", ["Nigeria"], "Nigeria", "west-africa", {}),
        ("chad", ["Chad"], "Chad", "central-africa", {}),
        ("cameroon", ["Cameroon"], "Cameroon", "central-africa", {}),
        ("central-african-republic", ["Central African Republic"], "Central African Republic", "central-africa", {}),
        ("equatorial-guinea", ["Equatorial Guinea"], "Equatorial Guinea", "central-africa", {}),
        ("sao-tome-and-principe", ["São Tomé and Principe"], "São Tomé and Príncipe", "central-africa", {}),
        ("gabon", ["Gabon"], "Gabon", "central-africa", {}),
        ("republic-of-the-congo", ["Republic of the Congo"], "Republic of the Congo", "central-africa", {}),
        ("dr-congo", ["Democratic Republic of the Congo"], "DR Congo", "central-africa", {}),
        ("uganda", ["Uganda"], "Uganda", "east-africa", {}),
        ("kenya", ["Kenya"], "Kenya", "east-africa", {}),
        ("rwanda", ["Rwanda"], "Rwanda", "east-africa", {}),
        ("burundi", ["Burundi"], "Burundi", "east-africa", {}),
        ("tanzania", ["United Republic of Tanzania"], "Tanzania", "east-africa", {}),
        ("angola", ["Angola"], "Angola", "southern-africa", {}),
        ("zambia", ["Zambia"], "Zambia", "southern-africa", {}),
        ("malawi", ["Malawi"], "Malawi", "southern-africa", {}),
        ("mozambique", ["Mozambique"], "Mozambique", "southern-africa", {}),
        ("zimbabwe", ["Zimbabwe"], "Zimbabwe", "southern-africa", {}),
        ("namibia", ["Namibia"], "Namibia", "southern-africa", {}),
        ("botswana", ["Botswana"], "Botswana", "southern-africa", {}),
        ("south-africa", ["South Africa"], "South Africa", "southern-africa", {}),
        ("lesotho", ["Lesotho"], "Lesotho", "southern-africa", {}),
        ("eswatini", ["eSwatini"], "Eswatini", "southern-africa", {}),
        ("madagascar", ["Madagascar"], "Madagascar", "indian-ocean", {"islands": True}),
        ("comoros", ["Comoros"], "Comoros", "indian-ocean", {"islands": True}),
        ("mauritius", ["Mauritius"], "Mauritius", "indian-ocean", {"islands": True}),
    ],
}

REGIONS["asia"] = {
    # Russia's far north-east crosses the 180° meridian, so the box has a second piece.
    "box": shapely.union(box(25, -12, 180, 82), box(-180, 60, -168, 72)),
    "periods": [
        ("bronze-age", "Bronze Age", -3400, -1301),
        ("iron-age", "Iron Age kingdoms", -1300, -222),
        ("classical", "Classical empires", -221, 588),
        ("medieval", "Medieval kingdoms", 589, 1205),
        ("mongol", "Mongol era", 1206, 1367),
        ("early-modern", "Early modern empires", 1368, 1838),
        ("imperialism", "Age of imperialism", 1839, 1945),
        ("since-1946", "Since 1946", 1946, 2024),
    ],
    "periodNote": (
        "Bins are anchored on cited dates: the Indus Valley Civilisation (c. 3300–1300 BCE), the Qin "
        "unification of China (221 BCE), the Sui reunification of China (589), the Mongol Empire (1206–1368), "
        "the First Opium War (1839) and Japan's surrender on 2 September 1945. These anchors lean on South and "
        "East Asian history; other parts of Asia have their own chronologies."
    ),
    "periodSources": [
        "https://en.wikipedia.org/wiki/Indus_Valley_Civilisation",
        "https://en.wikipedia.org/wiki/Qin_dynasty",
        "https://en.wikipedia.org/wiki/Sui_dynasty",
        "https://www.worldhistory.org/mongol_empire/",
        "https://en.wikipedia.org/wiki/First_Opium_War",
        "https://en.wikipedia.org/wiki/End_of_World_War_II_in_Asia",
    ],
    "lanes": [
        ("georgia", ["Georgia"], "Georgia", "caucasus", {}),
        ("armenia", ["Armenia"], "Armenia", "caucasus", {}),
        ("azerbaijan", ["Azerbaijan"], "Azerbaijan", "caucasus", {}),
        ("kazakhstan", ["Kazakhstan"], "Kazakhstan", "central-asia", {}),
        ("turkmenistan", ["Turkmenistan"], "Turkmenistan", "central-asia", {}),
        ("uzbekistan", ["Uzbekistan"], "Uzbekistan", "central-asia", {}),
        ("kyrgyzstan", ["Kyrgyzstan"], "Kyrgyzstan", "central-asia", {}),
        ("tajikistan", ["Tajikistan"], "Tajikistan", "central-asia", {}),
        ("afghanistan", ["Afghanistan"], "Afghanistan", "south-asia", {}),
        ("pakistan", ["Pakistan"], "Pakistan", "south-asia", {}),
        ("india", ["India"], "India", "south-asia", {}),
        ("nepal", ["Nepal"], "Nepal", "south-asia", {}),
        ("bhutan", ["Bhutan"], "Bhutan", "south-asia", {}),
        ("bangladesh", ["Bangladesh"], "Bangladesh", "south-asia", {}),
        ("sri-lanka", ["Sri Lanka"], "Sri Lanka", "south-asia", {}),
        ("myanmar", ["Myanmar"], "Myanmar", "mainland-southeast", {}),
        ("thailand", ["Thailand"], "Thailand", "mainland-southeast", {}),
        ("laos", ["Laos"], "Laos", "mainland-southeast", {}),
        ("cambodia", ["Cambodia"], "Cambodia", "mainland-southeast", {}),
        ("vietnam", ["Vietnam"], "Vietnam", "mainland-southeast", {}),
        ("malaysia", ["Malaysia"], "Malaysia", "maritime-southeast", {}),
        ("singapore", ["Singapore"], "Singapore", "maritime-southeast", {}),
        ("brunei", ["Brunei"], "Brunei", "maritime-southeast", {}),
        ("indonesia", ["Indonesia"], "Indonesia", "maritime-southeast", {}),
        ("timor-leste", ["East Timor"], "Timor-Leste", "maritime-southeast", {}),
        ("philippines", ["Philippines"], "Philippines", "maritime-southeast", {}),
        ("mongolia", ["Mongolia"], "Mongolia", "east-asia", {}),
        # Hong Kong and Macau are Special Administrative Regions of China and share its lane.
        ("china", ["China", "Hong Kong S.A.R.", "Macao S.A.R"], "China", "east-asia", {}),
        ("taiwan", ["Taiwan"], "Taiwan", "east-asia", {}),
        ("north-korea", ["North Korea"], "North Korea", "east-asia", {}),
        ("south-korea", ["South Korea"], "South Korea", "east-asia", {}),
        ("japan", ["Japan"], "Japan", "east-asia", {}),
        # Europe's Russia lane stops at 60°E; this lane is the rest, including Chukotka beyond 180°.
        ("russia-east", ["Russia"], "Russia (east of 60°E)", "north-asia",
         {"within": shapely.union(box(60, 35, 180, 82), box(-180, 60, -168, 72))}),
    ],
}

TRANSLIT = str.maketrans({"ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "æ": "ae", "Æ": "Ae", "đ": "d", "Đ": "D",
                          "ß": "ss", "þ": "th", "Þ": "Th", "ð": "d", "œ": "oe", "ı": "i"})


def slugify(s):
    s = unicodedata.normalize("NFKD", s.translate(TRANSLIT)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def year_tag(y):
    return f"{-y}bce" if y < 0 else str(y)


def tier(peak, peak_km2):
    if peak >= 0.5:
        return 1
    if peak >= 0.2 or peak_km2 >= TIER2_KM2:
        return 2
    return 3


def admin_name(a):
    """Display name of a lane member: "Peru", or the label given for a clipped part."""
    if isinstance(a, str):
        return a
    return a[2] if len(a) > 2 else a[0]


def admin_name_raw(a):
    """Natural Earth ADMIN name of a lane member (plain name or (name, clip box, label))."""
    return a if isinstance(a, str) else a[0]


def lane_geometry(ne, admins, region_box, opt):
    """Union of Natural Earth countries (or parts of them) for one lane, in EPSG:4326."""
    parts = []
    for a in admins:
        name, part = (a, None) if isinstance(a, str) else (a[0], a[1])
        rows = ne[ne.ADMIN == name]
        assert len(rows) == 1, name
        g = rows.geometry.values[0]
        parts.append(shapely.intersection(g, part) if part is not None else g)
    geom = shapely.intersection(shapely.union_all(parts), region_box)
    if "within" in opt:
        geom = shapely.intersection(geom, opt["within"])
    if "without" in opt:
        geom = shapely.difference(geom, opt["without"])
    return geom


def load_lanes(ne_path, cfg):
    ne = gpd.read_file(ne_path)
    rows = []
    for order, (lid, admins, label, group, opt) in enumerate(cfg["lanes"]):
        geom = lane_geometry(ne, admins, cfg["box"], opt)
        rows.append({"lane": lid, "label": label, "group": group, "order": order,
                     "neAdmin": [admin_name(a) for a in admins], "geometry": geom})
    g = gpd.GeoDataFrame(rows, crs=4326).to_crs(6933)
    g["geometry"] = shapely.make_valid(g.geometry.values)
    g["km2"] = g.area / 1e6
    return g


def load_cliopatria(path):
    g = gpd.read_file(path)
    g = g[g.Type == "POLITY"].copy()
    g["realm"] = g.Name.str.startswith("(")
    g["base"] = g.Name.str.replace(r"^\((.*)\)$", r"\1", regex=True).str.strip()
    g["Wikidata"] = g.Wikidata.fillna("").str.strip()
    g["Wikipedia"] = g.Wikipedia.fillna("").str.strip()
    g["SeshatID"] = g.SeshatID.fillna("")
    g = g.sort_values(["base", "Wikidata", "FromYear"])
    inc, last_key, last_to, n = [], None, None, 0
    for b, w, f, t in zip(g.base, g.Wikidata, g.FromYear, g.ToYear):
        key = (b, w)
        if key != last_key:
            n, last_to = 0, t
        elif f - last_to > SPLIT_GAP:
            n += 1
        last_to = max(last_to, t) if key == last_key else t
        last_key = key
        inc.append(n)
    g["inc"] = inc
    return g.reset_index(drop=True)


def assign_ids(g):
    keys = g.groupby(["base", "Wikidata", "inc"]).agg(start=("FromYear", "min")).reset_index()
    per_base = Counter(keys.base)
    ids = {}
    for b, w, i, s in zip(keys.base, keys.Wikidata, keys.inc, keys.start):
        slug = slugify(b)
        if per_base[b] > 1:
            slug += "-" + year_tag(int(s))
        ids[(b, w, i)] = slug
    dup = {s for s, c in Counter(ids.values()).items() if c > 1}
    for k, s in ids.items():
        if s in dup:
            ids[k] = f"{s}-{(k[1] or 'noqid').lower()}" + (f"-{k[2]}" if k[2] else "")
    assert len(set(ids.values())) == len(ids), "slug collision"
    g["eid"] = [ids[k] for k in zip(g.base, g.Wikidata, g.inc)]
    return g


def spans_for(rows, min_share):
    """rows: (from, to, share, realm, overlap_km2, inside_frac)."""
    core_years = {y for f, t, s, r, k, i in rows if not r for y in range(f, t + 1)}
    best = {}  # year -> [share, realm, km2, inside_ok]
    for f, t, s, realm, km2, inside in rows:
        ok = (inside >= INSIDE_FRAC and km2 >= INSIDE_MIN_KM2) or \
             (inside >= INSIDE_SMALL_FRAC and km2 >= INSIDE_SMALL_KM2)
        for y in range(f, t + 1):
            if core_years and y not in core_years:
                continue
            cur = best.setdefault(y, [0.0, False, 0.0, False])
            # ties go to the core polity, so the realm flag does not depend on row order
            if s > cur[0] or (s == cur[0] and cur[1] and not realm):
                cur[0], cur[1] = s, realm
            cur[2] = max(cur[2], km2)
            cur[3] = cur[3] or ok
    years = sorted(y for y, (s, _, km2, ok) in best.items() if s >= min_share or ok or km2 >= TIER2_KM2)
    # Years that count by share and years that count only by the inside or large-area rule form
    # separate runs, so a remnant (Norway holding only Jan Mayen in 1941–1944) never merges into
    # the surrounding span and borrows its peak share and tier.
    runs = []
    for y in years:
        by_share = best[y][0] >= min_share
        if runs and y - runs[-1][1] <= GAP_TOL + 1 and runs[-1][2] == by_share:
            runs[-1][1] = y
        else:
            runs.append([y, y, by_share])
    out = []
    for f, t, _ in runs:
        vals = [best[y] for y in range(f, t + 1) if y in best]
        peak, realm, _, _ = max(vals, key=lambda v: v[0])
        peak_km2 = max(v[2] for v in vals)
        if t - f + 1 < MIN_YEARS and peak < KEEP_SHORT_PEAK and peak_km2 < TIER2_KM2:
            continue  # short flicker; kept when it covered half the country or 100,000 km² of it
        peak = round(peak, 2)
        rec = {"from": f, "to": t, "peak": peak, "km2": int(round(peak_km2, -3)) or int(round(peak_km2, -2)),
               "tier": tier(peak, peak_km2)}
        if realm:
            rec["realm"] = True
        if peak < min_share:
            rec["inside" if peak_km2 < TIER2_KM2 else "large"] = True
        out.append(rec)
    return out


def build(region_id, clio_path, ne_path, sources_dir=None):
    cfg = REGIONS[region_id]
    lanes = load_lanes(ne_path, cfg)
    clio = assign_ids(load_cliopatria(clio_path))
    sub = clio[clio.intersects(cfg["box"])].to_crs(6933).reset_index(drop=True)
    sub["geometry"] = shapely.make_valid(sub.geometry.values)
    sub["km2"] = shapely.area(sub.geometry.values) / 1e6
    sidx, geoms = sub.sindex, sub.geometry.values

    # Land area of each polity polygon. Cliopatria's coastal and island polygons include
    # sea, so the inside rule compares the overlap with the polity's land, not its outline.
    ne_all = gpd.read_file(ne_path)
    ne_eq = ne_all.to_crs(6933)
    land_parts = shapely.make_valid(ne_eq.geometry.values)
    land_tree = shapely.STRtree(land_parts)
    land_cache = {}

    def land_km2(i):
        if i not in land_cache:
            g = geoms[i]
            hits = land_tree.query(g, predicate="intersects")
            land_cache[i] = float(shapely.area(shapely.intersection(land_parts[hits], g)).sum()) / 1e6 if len(hits) else 0.0
        return land_cache[i]

    # A polity that *is* a modern country without a lane of its own (a micro-state such as
    # Monaco, matched on Wikidata id) is never placed in a neighbour's lane by the inside rule.
    lane_admins = {admin_name_raw(a) for c in REGIONS.values() for l in c["lanes"] for a in l[1]}
    laneless_qids = set(ne_all.loc[~ne_all.ADMIN.isin(lane_admins), "WIKIDATAID"].dropna())

    per_lane, used = {}, set()
    for _, lane in lanes.iterrows():
        islands = cfg["lanes"][int(lane.order)][4].get("islands", False)
        min_share = MIN_SHARE if islands else min(max(MIN_SHARE, NOISE_KM2 / lane.km2), 0.5)
        lanes.loc[lanes.lane == lane.lane, "minShare"] = round(min_share, 3)
        cand = sidx.query(lane.geometry, predicate="intersects")
        overlap = shapely.area(shapely.intersection(geoms[cand], lane.geometry)) / 1e6
        by_e = defaultdict(list)
        for i, ov in zip(cand, overlap):
            if ov <= 0:
                continue
            r = sub.iloc[i]
            land = land_km2(i)
            inside = 0.0 if r.Wikidata in laneless_qids else min(1.0, ov / land) if land else 0.0
            by_e[r.eid].append((int(r.FromYear), int(r.ToYear), float(min(ov / lane.km2, 1.0)), bool(r.realm),
                                float(ov), inside))
        spans = [{"id": eid, **sp} for eid, rows in by_e.items() for sp in spans_for(rows, min_share)]
        used.update(s["id"] for s in spans)
        per_lane[lane.lane] = sorted(spans, key=lambda s: (s["from"], -s["peak"]))

    qid_names = clio[clio.Wikidata != ""].groupby("Wikidata").eid.unique()
    registry, review = {}, []
    for eid, grp in clio[clio.eid.isin(used)].groupby("eid"):
        core = grp[~grp.realm]
        basis = core if len(core) else grp
        name, wd = grp.base.iloc[0], grp.Wikidata.iloc[0]
        wp = Counter(x for x in grp.Wikipedia if x).most_common()
        seshat = sorted({s for v in grp.SeshatID for s in v.split(";") if s})
        rec = {"name": name, "years": [int(basis.FromYear.min()), int(basis.ToYear.max())]}
        if wd: rec["wikidata"] = wd
        if wp: rec["wikipedia"] = wp[0][0]
        if seshat: rec["seshat"] = seshat
        if not len(core): rec["realmOnly"] = True
        registry[eid] = rec
        flags = []
        if not wd: flags.append("no-wikidata")
        if wd and len(qid_names[wd]) > 1:
            flags.append("shared-wikidata:" + ",".join(sorted(x for x in qid_names[wd] if x != eid)))
        if wp and wp[0][0].lower() != name.lower():
            flags.append("wikipedia-title-differs:" + wp[0][0])
        if len(wp) > 1: flags.append("multiple-wikipedia-titles")
        if grp.inc.max() > 0 or eid != slugify(name): flags.append("split-incarnation")
        if not len(core): flags.append("realm-only")
        if flags:
            other_names = {clio.loc[clio.eid == x, "base"].iloc[0] for x in qid_names[wd]} - {name} if wd else set()
            severity = "check" if (not wd or other_names or len(wp) > 1) else "info"
            review.append({"id": eid, "name": name, "years": rec["years"], "severity": severity, "flags": flags})

    per_events, notes = {}, {}
    if sources_dir:
        pol_snap = enrich.load_json(os.path.join(sources_dir, "wikidata-polities.json"))
        if pol_snap:
            wd_flags, notes["linkCheck"] = enrich.link_check(registry, pol_snap)
            by_id = {r["id"]: r for r in review}
            for eid, fl in wd_flags.items():
                r = by_id.get(eid)
                if r is None:
                    r = {"id": eid, "name": registry[eid]["name"], "years": registry[eid]["years"],
                         "severity": "check", "flags": []}
                    review.append(r); by_id[eid] = r
                r["flags"] += fl
                r["severity"] = "check"
        placer = enrich.Placer(lanes, cfg["lanes"], ne_all)
        sup = enrich.load_json(os.path.join(sources_dir, "supplement.json"))
        sup_snap = enrich.load_json(os.path.join(sources_dir, "wikidata-supplement.json"))
        if sup and sup_snap:
            mapped = set(clio.Wikidata) | {r["wd"]["id"] for r in registry.values() if r.get("wd", {}).get("id")}
            s_lanes, s_reg, s_rev, notes["supplementSkipped"] = enrich.supplement(
                sup, sup_snap, placer, set(clio.eid), mapped, slugify)
            for lid, spans in s_lanes.items():
                per_lane[lid] = sorted(per_lane[lid] + spans, key=lambda s: (s["from"], -s.get("peak", 0)))
            registry.update(s_reg)
            review += s_rev
        cul_rules = enrich.load_json(os.path.join(sources_dir, f"cultures-{region_id}.json"))
        cul_snap = enrich.load_json(os.path.join(sources_dir, "wikipedia-cultures.json"))
        if cul_rules and cul_snap:
            skip = set(clio.Wikidata) | {r.get("wikidata") for r in registry.values()} | \
                {r["wd"]["id"] for r in registry.values() if r.get("wd", {}).get("id")}
            c_lanes, c_reg, c_rev, notes["cultures"] = cultures.build(
                cul_snap, cul_rules, placer, ne_all, skip, set(clio.eid) | set(registry), slugify)
            for lid, spans in c_lanes.items():
                per_lane[lid] = sorted(per_lane[lid] + spans, key=lambda s: (s["from"], -s.get("peak", 0)))
            registry.update(c_reg)
            review += c_rev
        ev_snap = enrich.load_json(os.path.join(sources_dir, "wikidata-events.json"))
        if ev_snap:
            per_events, notes["events"] = enrich.events(ev_snap, placer)
            notes["eventsMinSitelinks"] = ev_snap.get("minSitelinks")
        lane_rows = [(l, g) for l, g in zip(lanes.sort_values("order").lane, lanes.sort_values("order").group)
                     if per_lane[l]]
        notes["eras"] = eras_mod.build(
            region_id, cfg, lane_rows, per_lane, registry,
            enrich.load_json(os.path.join(sources_dir, f"eras-{region_id}.json")),
            enrich.load_json(os.path.join(sources_dir, "wikipedia-eras.json")), cfg.get("binsFrom"),
            enrich.load_json(os.path.join(sources_dir, "periodo-eras.json")))
    return lanes, per_lane, registry, review, per_events, notes


def dump_lines(obj_head, key, items):
    head = json.dumps(obj_head, ensure_ascii=False)[:-1]
    body = ",\n".join("  " + json.dumps(i, ensure_ascii=False, separators=(",", ":")) for i in items)
    return f'{head},\n "{key}":[\n{body}\n]}}\n'


def write(region_id, out_dir, lanes, per_lane, registry, review, per_events=None, notes=None):
    per_events, notes = per_events or {}, notes or {}
    cfg = REGIONS[region_id]
    region = os.path.join(out_dir, region_id)
    os.makedirs(region, exist_ok=True)
    # Period files of an earlier build that this one does not write again must not linger.
    for sub in os.listdir(region):
        path = os.path.join(region, sub)
        if os.path.isdir(path):
            for fn in os.listdir(path):
                if fn.endswith(".json"):
                    os.remove(os.path.join(path, fn))
    src_tag = f"{SOURCE['id']}@{SOURCE['version']}"
    lane_index, omitted = [], []
    for _, lane in lanes.sort_values("order").iterrows():
        spans = per_lane[lane.lane]
        evs = per_events.get(lane.lane, [])
        if not spans:
            omitted.append({"id": lane.lane, "label": lane.label, "naturalEarth": list(lane["neAdmin"]),
                            "reason": "no Cliopatria polity covers this area in any year"})
            continue
        files = []
        os.makedirs(os.path.join(region, lane.lane), exist_ok=True)
        for pid, plabel, a, b in cfg["periods"]:
            items = [{"id": s["id"], "name": registry[s["id"]]["name"], **{k: v for k, v in s.items() if k != "id"}}
                     for s in spans if s["from"] <= b and s["to"] >= a]
            ev_items = [e for e in evs if a <= e["year"] <= b]
            if not items and not ev_items:
                continue
            head = {"lane": lane.lane, "period": pid, "years": [a, b],
                    "source": src_tag if not any("extent" in s for s in items) else src_tag + "+wikidata"}
            body = dump_lines(head, "spans", items)
            if ev_items:
                body = body[:-3] + '],\n "events":[\n' + ",\n".join(
                    "  " + json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in ev_items) + "\n]}\n"
            with open(os.path.join(region, lane.lane, f"{pid}.json"), "w") as f:
                f.write(body)
            files.append(pid)
        lane_index.append({"id": lane.lane, "label": lane.label, "group": lane.group, "order": int(lane.order),
                           "km2": int(round(lane.km2)), "minShare": float(lane.minShare),
                           "naturalEarth": list(lane["neAdmin"]), "periods": files, "spans": len(spans),
                           **({"events": len(evs)} if evs else {})})
    index = {
        "region": region_id,
        "generated": GENERATED,
        "sources": [SOURCE, BORDERS] + ([WIKIDATA, WIKIPEDIA] if notes else []),
        "periods": [{"id": p, "label": l, "years": [a, b]} for p, l, a, b in cfg["periods"]],
        "periodNote": cfg["periodNote"],
        **({"periodSources": cfg["periodSources"]} if "periodSources" in cfg else {}),
        **({"omittedLanes": omitted + EXCLUDED.get(region_id, [])} if omitted or EXCLUDED.get(region_id) else {}),
        "tiers": {"1": "peak share >= 0.5 (dominant)",
                  "2": f"peak share >= 0.2 or peak overlap >= {TIER2_KM2} km2",
                  "3": "the rest (detail)"},
        "params": {"minShare": MIN_SHARE, "noiseKm2": NOISE_KM2, "gapTolerance": GAP_TOL,
                   "minYears": MIN_YEARS, "keepShortPeak": KEEP_SHORT_PEAK, "splitGap": SPLIT_GAP,
                   "insideFrac": INSIDE_FRAC, "insideMinKm2": INSIDE_MIN_KM2,
                   "insideSmallFrac": INSIDE_SMALL_FRAC, "insideSmallKm2": INSIDE_SMALL_KM2, "tier2Km2": TIER2_KM2},
        **({"cited": {
            "linkCheck": dict(sorted(notes["linkCheck"].items())) if "linkCheck" in notes else None,
            "events": {"minSitelinks": notes.get("eventsMinSitelinks"), "maxCountryLanes": enrich.MAX_EVENT_LANES,
                       "nearKm": enrich.NEAR_KM, "outcomes": dict(sorted(notes["events"].items()))}
            if "events" in notes else None,
            **({"cultures": {k: (sorted(v) if isinstance(v, list) else v) for k, v in notes["cultures"].items()}}
               if "cultures" in notes else {}),
        }} if notes else {}),
    }
    with open(os.path.join(region, "_index.json"), "w") as f:
        f.write(dump_lines(index, "lanes", lane_index))
    if "eras" in notes:
        areas, era_list = notes["eras"]
        head = {"region": region_id,
                "note": "The Eras level. Sourced areas carry the cited periods of a published periodization "
                        "(cite); elsewhere, and after an area's last period, the region's period bins per lane "
                        "group (basis: period-bin), kept only where the data records a state or culture. "
                        "Leaders are computed from the spans: most lane-years, weighted by tier.",
                "areas": areas}
        with open(os.path.join(region, "_eras.json"), "w") as f:
            f.write(dump_lines(head, "eras", era_list))
    reg_items = [{"id": k, **v} for k, v in sorted(registry.items())]
    with open(os.path.join(region, "_polities.json"), "w") as f:
        f.write(dump_lines({"region": region_id, "source": src_tag}, "polities", reg_items))
    with open(os.path.join(region, "_review.json"), "w") as f:
        f.write(dump_lines({"region": region_id, "note": "Automatic flags on source records that need a human check before release."},
                           "items", sorted(review, key=lambda r: r["years"][0])))


if __name__ == "__main__":
    region_id, clio_path, ne_path, out_dir = sys.argv[1:5]
    lanes, per_lane, registry, review, per_events, notes = build(region_id, clio_path, ne_path,
                                                                 os.path.join(out_dir, "sources"))
    # hand corrections to Wikipedia links (sources/link-fixes.json), after everything that reads them
    fixes = link_fixes.load(os.path.join(out_dir, "sources", "link-fixes.json"))
    for pid, rec in registry.items():
        link_fixes.apply_polity(pid, rec, fixes)
    for evs in (per_events or {}).values():
        for e in evs:
            link_fixes.apply_event(e, fixes)
    write(region_id, out_dir, lanes, per_lane, registry, review, per_events, notes)
    for n in notes.get("supplementSkipped", []):
        print("  supplement skipped:", n)
    if "linkCheck" in notes: print("  link check:", dict(notes["linkCheck"]))
    if "events" in notes: print("  events:", dict(notes["events"]))
    if "cultures" in notes:
        c = notes["cultures"]
        print("  cultures: kept", c["kept"], {k: len(v) for k, v in c.items() if isinstance(v, list)})
        for k in ("undated", "unplaced", "living", "excluded", "onChart"):
            print(f"    {k}: {'; '.join(c[k])[:600]}")
    if "eras" in notes:
        print("  eras:", len(notes["eras"][1]), "areas:", len(notes["eras"][0]))
    spans = [s for v in per_lane.values() for s in v]
    print(f"{region_id}: lanes {len(per_lane)} polities {len(registry)} spans {len(spans)} "
          f"(t1 {sum(s['tier'] == 1 for s in spans)}, t2 {sum(s['tier'] == 2 for s in spans)}, "
          f"t3 {sum(s['tier'] == 3 for s in spans)}, inside {sum('inside' in s for s in spans)}, "
          f"supplement {sum('extent' in s for s in spans)}) review {len(review)} "
          f"events {sum(len(v) for v in per_events.values())}")
