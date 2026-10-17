/** All JSON files of one region, bundled into their own chunk so regions load on demand. */
export const files = import.meta.glob('/data/africa-middle-east/**/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;
