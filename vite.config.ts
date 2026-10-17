/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Two builds:
 *  - default: a normal SPA build in dist/ (React and d3 bundled).
 *  - "artifact": one self-contained HTML in dist-artifact/ for the claude.ai preview.
 *    React and d3 are loaded from cdnjs as globals, so they are marked external here.
 */
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    plugins: [react(), ...(artifact ? [viteSingleFile()] : [])],
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
