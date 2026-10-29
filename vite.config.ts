/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { REGIONS, regionKeys } from './scripts/story-keys.mjs';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * The stored story packs, served next to the page and fetched by the drawer one region at a time, so neither
 * build carries every summary in its bundle:
 *  - stories/<lang>/<region>.json: the Wikipedia text the drawer shows (data/stories, from
 *    data/tools/fetch_stories.py), minified, without the build-only `records` list;
 *  - translations/<lang>/<region>.json: every stored translation a story of the region can show
 *    (data/translations/<lang>/*.json, wherever it was first translated), each unit carrying its batch's
 *    metadata, without the build-only `records` and `notes`.
 * `virtual:story-packs` tells the app which languages have packs, so it asks only for those, and the data
 * release (data/version.json) the Sources panel names.
 */
function storyPacks(): Plugin {
  const dataDir = r('./data');
  const storiesDir = `${dataDir}/stories`;
  const trDir = `${dataDir}/translations`;
  const langsIn = (dir: string, keep = (f: string) => f.endsWith('.json')) =>
    existsSync(dir) ? readdirSync(dir).filter((l) => readdirSync(`${dir}/${l}`).some(keep)) : [];
  const storyLangs = () => langsIn(storiesDir);
  const trLangs = () => langsIn(trDir, (f) => f.endsWith('.json') && !f.startsWith('_'));
  let keys: Record<string, Set<string>> | null = null;
  const story = (lang: string, region: string) => {
    const path = `${storiesDir}/${lang}/${region}.json`;
    if (!existsSync(path)) return null;
    const body = JSON.parse(readFileSync(path, 'utf8'));
    for (const u of Object.values(body.units) as Array<Record<string, unknown>>) delete u.records;
    return JSON.stringify(body);
  };
  const translations = (lang: string, region: string) => {
    if (!REGIONS.includes(region) || !trLangs().includes(lang)) return null;
    keys ??= regionKeys(dataDir);
    const units: Record<string, unknown> = {};
    for (const f of readdirSync(`${trDir}/${lang}`).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
      const b = JSON.parse(readFileSync(`${trDir}/${lang}/${f}`, 'utf8'));
      for (const [k, u] of Object.entries(b.units) as Array<[string, Record<string, unknown>]>) {
        if (!keys[region].has(k)) continue;
        const { records: _r, notes: _n, ...rest } = u;
        units[k] = {
          ...rest,
          lang: b.lang,
          method: b.method,
          translator: b.translator,
          translated: u.translated ?? b.translated,
          reviewed: u.reviewed ?? b.reviewed,
        };
      }
    }
    return JSON.stringify({ lang, region, licence: 'CC BY-SA 4.0', units });
  };
  const dataVersion = () => {
    const v = JSON.parse(readFileSync(`${dataDir}/version.json`, 'utf8'));
    return { version: v.version as string, date: v.date as string };
  };
  const VIRTUAL = 'virtual:story-packs';
  return {
    name: 'story-packs',
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : null),
    load: (id) =>
      id === `\0${VIRTUAL}`
        ? [
            `export const storyLangs = ${JSON.stringify(storyLangs())};`,
            `export const translationLangs = ${JSON.stringify(trLangs())};`,
            `export const dataVersion = ${JSON.stringify(dataVersion())};`,
          ].join('\n')
        : null,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/(stories|translations)\/([a-z-]+)\/([a-z-]+)\.json(\?.*)?$/);
        const body = m && (m[1] === 'stories' ? story(m[2], m[3]) : translations(m[2], m[3]));
        if (!body) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
    generateBundle() {
      for (const lang of storyLangs())
        for (const region of REGIONS) {
          const body = story(lang, region);
          if (body) this.emitFile({ type: 'asset', fileName: `stories/${lang}/${region}.json`, source: body });
        }
      for (const lang of trLangs())
        for (const region of REGIONS)
          this.emitFile({ type: 'asset', fileName: `translations/${lang}/${region}.json`, source: translations(lang, region)! });
    },
  };
}

export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    plugins: [react(), storyPacks(), ...(artifact ? [viteSingleFile()] : [])],
    resolve: {
      alias: {
        '@': r('./src'),
        ...(artifact ? { 'react/jsx-runtime': r('./src/platform/jsx-runtime-global.ts') } : {}),
      },
    },
    build: artifact
      ? {
          outDir: 'dist-artifact',
          rollupOptions: {
            external: ['react', 'react-dom', 'react-dom/client', 'd3-scale', 'd3-zoom', 'd3-selection', 'd3-transition'],
            output: {
              format: 'iife',
              globals: {
                react: 'React',
                'react-dom': 'ReactDOM',
                'react-dom/client': 'ReactDOM',
                'd3-scale': 'd3',
                'd3-zoom': 'd3',
                'd3-selection': 'd3',
                'd3-transition': 'd3',
              },
            },
          },
        }
      : {},
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
