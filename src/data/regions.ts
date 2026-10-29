/**
 * Regions in build order. Their names, notes and group labels are in the message catalogues
 * (src/i18n/messages/<locale>.json): `region.<id>.label|all|in|chartNote|note.N` and `group.<group>`.
 */
export interface RegionMeta {
  id: string;
  available: boolean;
  /** Years the chart opens on when most of the region's records are recent. */
  initialYears?: [number, number];
  /** Year marker to use when the current one falls outside initialYears. */
  initialCursor?: number;
}

export const REGIONS: RegionMeta[] = [
  { id: 'europe', available: true },
  { id: 'americas', available: true },
  { id: 'oceania', available: true, initialYears: [1600, 2024], initialCursor: 1900 },
  { id: 'africa-middle-east', available: true },
  { id: 'asia', available: true },
];

export const regionMeta = (id: string): RegionMeta => REGIONS.find((r) => r.id === id) ?? REGIONS[0];
