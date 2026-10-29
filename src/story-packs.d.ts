/** Languages with stored story packs, from the story-packs plugin in vite.config.ts. */
declare module 'virtual:story-packs' {
  /** Languages with stored Wikipedia text (stories/<lang>/<region>.json). */
  export const storyLangs: string[];
  /** Languages with stored translations (translations/<lang>/<region>.json). */
  export const translationLangs: string[];
  /** The data release (data/version.json). */
  export const dataVersion: { version: string; date: string };
}
