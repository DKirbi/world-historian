/** Fallback advance width of the condensed UI face at 11px; replaced by a measurement. */
export const CHAR_W = 5.4;

/** Average glyph width of `fontFamily` at the block-label size, with a small safety margin. */
export function measureCharWidth(fontFamily: string): number {
  const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx || !fontFamily) return CHAR_W;
  ctx.font = `500 11px ${fontFamily}`;
  const sample = 'Kingdom of the Franks Holy Roman Empire Byzantine Ottoman';
  return (ctx.measureText(sample).width / sample.length) * 1.06;
}
export const LINE_H = 12;

/**
 * Word-wrap `text` into at most `maxLines` lines of `maxChars`, ending with an
 * ellipsis when it does not fit. Pure, so blocks can memoize it.
 */
export function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  if (maxChars < 3 || maxLines < 1) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++];
    while (i < words.length && `${line} ${words[i]}`.length <= maxChars) line += ` ${words[i++]}`;
    lines.push(line);
  }
  const overflow = i < words.length;
  return lines.map((l, idx) => {
    if (l.length > maxChars) return `${l.slice(0, maxChars - 1)}…`;
    if (idx === lines.length - 1 && overflow) return `${l.length + 1 > maxChars ? l.slice(0, maxChars - 1) : l}…`;
    return l;
  });
}

/** One line of at most `maxChars`, with an ellipsis when cut. */
export const truncate = (text: string, maxChars: number) =>
  text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
