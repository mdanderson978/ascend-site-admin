// Test site for test/astro.test.mjs: a minimal source repo using the
// integration. The test points CONTENT_ROOT at a temporary content checkout
// (pages, uploads and their AVIF sets) and OUT_DIR at a temporary build folder.
import path from 'node:path';
import { defineConfig } from 'astro/config';
import siteAdmin from 'site-admin/astro';

const contentRoot = process.env.CONTENT_ROOT;

export default defineConfig({
  output: 'static',
  outDir: process.env.OUT_DIR,
  publicDir: path.join(contentRoot, 'public'),
  cacheDir: path.join(process.env.OUT_DIR, '..', 'astro-cache'),
  integrations: [
    siteAdmin({
      contentRoot,
      strict: true,
      brand: {
        colors: { primary: '#1e5631', accent: '#c2410c', dark: '#1a2e1e', light: '#fdf8f0' },
        fonts: { display: 'Georgia, serif', body: 'system-ui, sans-serif' },
        radius: '12px',
      },
    }),
  ],
});
