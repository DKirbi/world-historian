export interface RegionMeta {
  id: string;
  label: string;
  /** "All of Europe", "All of the Americas" */
  allLabel: string;
  /** "in Europe", "in the Americas" */
  inLabel: string;
  available: boolean;
  /** One line shown under the chart when it matters for reading this region. */
  chartNote?: string;
  /** Longer notes for the Sources panel. */
  notes?: string[];
  /** Years the chart opens on when most of the region's records are recent. */
  initialYears?: [number, number];
  /** Year marker to use when the current one falls outside initialYears. */
  initialCursor?: number;
}

/** Regions in build order. */
export const REGIONS: RegionMeta[] = [
  {
    id: 'europe',
    label: 'Europe',
    allLabel: 'All of Europe',
    inLabel: 'in Europe',
    available: true,
    notes: [
      'Monaco, San Marino, Vatican City and Liechtenstein have no column. Where the source records them, those records are not placed in a neighbouring country’s column either.',
      'Russia is split at 60°E: the western part is here, the rest is in Asia.',
    ],
  },
  {
    id: 'americas',
    label: 'Americas',
    allLabel: 'All of the Americas',
    inLabel: 'in the Americas',
    available: true,
    chartNote:
      'Empty columns before 1500 mean no state is recorded, not empty land. Dashed blocks are states added from Wikidata whose territory is not mapped.',
    notes: [
      'Cliopatria maps few polities in the Americas before 1500. It includes the Olmec, Zapotec, Maya city-states, Teotihuacan, Classic Veracruz, Toltec, Michoacán, the Aztec Triple Alliance, Chimú, the Inca, the Chaco and Aztec Pueblo systems and the Haudenosaunee.',
      'Cliopatria does not map the Caral–Supe civilization, Chavín, Moche, Nazca, Wari, Tiwanaku, the Muisca Confederations or the Mississippian culture. They are added from Wikidata with its dates and shown in one country each, as dashed blocks without a mapped territory.',
      'Most Indigenous nations are still absent: neither source records them as states with dates and a place.',
      'The island states and territories of the Lesser Antilles share one column, as small Pacific islands do in Oceania. Hover its name to see which islands it includes.',
    ],
  },
  {
    id: 'oceania',
    label: 'Oceania',
    allLabel: 'All of Oceania',
    inLabel: 'in Oceania',
    available: true,
    initialYears: [1600, 2024],
    initialCursor: 1900,
    chartNote:
      'The map source has almost no Pacific states before European contact. Dashed blocks (Tonga, Tahiti, Samoa, Pohnpei) are added from Wikidata; their territory is not mapped.',
    notes: [
      'Cliopatria’s only Pacific state before colonisation is the Kingdom of Hawaiʻi (from 1791). The Tuʻi Tonga Empire, the Saudeleur dynasty of Pohnpei, the Kingdoms of Tahiti, Samoa and Tonga, and the later states of Samoa, Tonga and French Polynesia are added from Wikidata, without a mapped territory.',
      'Aboriginal and Torres Strait Islander nations and Māori iwi are not shown: they are peoples and nations rather than states with dated borders in either source.',
      'Small island states in Micronesia share one column so it covers at least about 1,000 km², as in the other regions. Hover its name to see which islands it includes. Tonga and the smaller Polynesian islands are combined the same way.',
      'British settlement in Australia began in 1788 with the First Fleet. It appears here from 1828, when the source maps first show Britain holding more than 100,000 km² of today’s Australia.',
    ],
  },
  {
    id: 'africa-middle-east',
    label: 'Africa & Middle East',
    allLabel: 'All of Africa & the Middle East',
    inLabel: 'in Africa & the Middle East',
    available: true,
    chartNote:
      'Empty columns mean no state is recorded, not empty land. Dashed blocks are kingdoms added from Wikidata whose territory is not mapped.',
    notes: [
      'Pre-colonial African states in the data include Kush, Axum, Makuria, Alodia, the Ghana Empire, Takrur, Kanem and Bornu, Mali, Songhai, Kongo, Oyo, Ashanti, Lunda, Merina, Sokoto, Zululand, the Ethiopian Empire, Adal, Funj, Darfur and Wadai.',
      'Cliopatria does not map Kerma, the Garamantes, Ife, Benin, Kilwa, Great Zimbabwe, the Hausa and Mossi kingdoms, Jolof, Rwanda, Buganda, Mutapa, Ndongo, Luba, Bunyoro, Dahomey, Kuba or Kaabu. They are added from Wikidata (or a quoted Wikipedia article where Wikidata has no date) and shown in one country each, as dashed blocks without a mapped territory.',
      'Columns follow Natural Earth’s country polygons: Palestine and Western Sahara are separate columns, Somaliland is counted within Somalia and Northern Cyprus within Cyprus. This is a mapping convention, not a position on disputed borders.',
      'Turkey and Cyprus also appear in Europe, with identical data in both regions.',
    ],
  },
  {
    id: 'asia',
    label: 'Asia',
    allLabel: 'All of Asia',
    inLabel: 'in Asia',
    available: true,
    chartNote:
      'Russia is split at 60°E: its western part is in Europe. Hong Kong and Macau are part of the China column.',
    notes: [
      'Coverage is dense from the Indus Valley Civilisation (from 3000 BCE in today’s Pakistan) and the Shang dynasty in China (from 1600 BCE). The source starts Japan with the Asuka period (540) and the Philippines with Namayan (1202), so earlier centuries there show no state.',
      'Columns follow Natural Earth’s country polygons: Taiwan is a separate column, Hong Kong and Macau are counted within China, Kashmir is divided as in those polygons and the Siachen Glacier has no column. This is a mapping convention, not a position on disputed borders.',
      'Georgia, Armenia and Azerbaijan are in this region; the Middle East, Iran and Turkey are in Africa & Middle East.',
    ],
  },
];

export const regionMeta = (id: string): RegionMeta => REGIONS.find((r) => r.id === id) ?? REGIONS[0];

/** Display names for the lane groups used in each region's _index.json. */
export const GROUP_LABELS: Record<string, string> = {
  // Europe
  iberia: 'Iberia',
  western: 'Western',
  'british-isles': 'British Isles',
  'low-countries': 'Low Countries',
  central: 'Central',
  italy: 'Italy & Malta',
  balkans: 'Balkans & Danube',
  anatolia: 'Anatolia & Cyprus',
  nordic: 'Nordic',
  baltic: 'Baltic',
  eastern: 'Eastern',
  // Oceania
  'australia-nz': 'Australia & New Zealand',
  melanesia: 'Melanesia',
  micronesia: 'Micronesia',
  polynesia: 'Polynesia',
  // Asia
  caucasus: 'Caucasus',
  'central-asia': 'Central Asia',
  'south-asia': 'South Asia',
  'mainland-southeast': 'Mainland Southeast Asia',
  'maritime-southeast': 'Maritime Southeast Asia',
  'east-asia': 'East Asia',
  'north-asia': 'Siberia & Russian Far East',
  // Africa & Middle East (Turkey and Cyprus reuse 'anatolia')
  levant: 'Levant',
  'mesopotamia-iran': 'Mesopotamia & Iran',
  arabia: 'Arabia',
  'north-africa': 'North Africa',
  'nile-horn': 'Nile & Horn of Africa',
  'west-africa': 'West Africa',
  'central-africa': 'Central Africa',
  'east-africa': 'East Africa',
  'southern-africa': 'Southern Africa',
  'indian-ocean': 'Indian Ocean islands',
  // Americas
  'north-america': 'North America',
  'mexico-central': 'Mexico & Central America',
  caribbean: 'Caribbean',
  'northern-south': 'Northern South America',
  andes: 'Andes',
  plata: 'Brazil & Río de la Plata',
};

export const groupLabel = (id: string) => GROUP_LABELS[id] ?? id;
