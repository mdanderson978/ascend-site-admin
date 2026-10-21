// site-admin/astro: the Astro integration for the page-builder elements.
// Added once to a source repo's astro.config.mjs:
//
//   import siteAdmin from 'site-admin/astro';
//   import { defineBrand } from 'site-admin/elements';
//   export default defineConfig({
//     integrations: [siteAdmin({ brand: defineBrand({ colors: { ... } }) })],
//   });
//
// It:
//   - inlines every stylesheet (build.inlineStylesheets: 'always')
//   - applies the brand's CSS variables to every page (low priority: site CSS wins)
//   - gives <BuilderHead>/<BuilderLayout> the media manifest and element CSS
//     through a virtual module, so pages render with the same functions as the
//     admin preview and never touch the file system at render time
//   - serves the WebP fallbacks in dev and copies them into the build (a copy,
//     never an encode: images are encoded once, at upload)
//   - writes /_ascend/brand.json (read by the admin) with the engine version
//   - runs the performance budget on every builder page and reports problems
//
// Node only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandCss, brandJson, defineBrand } from '../elements/brand.mjs';
import { checkPage } from '../elements/budget.mjs';
import { TOKENS_CSS_PATH } from '../elements/css.mjs';
import { fallbackFileName } from '../elements/media.mjs';
import { copyFallbacks, mediaPaths, readManifest } from '../media.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY = path.join(here, '..', 'elements', 'library');
export const ENGINE_VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

const CONFIG_ID = 'virtual:site-admin/astro-config';
const BRAND_ID = 'virtual:site-admin/brand.css';
// Resolved ids: the brand one ends in .css (and has no \0 prefix) so Vite's
// CSS pipeline bundles, and Astro inlines, it like any other stylesheet.
const RESOLVED_CONFIG = '\0site-admin-astro-config';
const RESOLVED_BRAND = '/__site-admin-brand.css';

/** A page rendered by <BuilderHead> carries this marker; the budget checks those pages. */
export const BUILDER_MARKER = 'data-ascend-builder';

// Comments out, whitespace collapsed. Spaces next to ':' are kept, since
// ".a :hover" and ".a:hover" are different selectors.
const minify = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').trim();

function elementStyles() {
  const css = { tokens: minify(fs.readFileSync(TOKENS_CSS_PATH, 'utf8')) };
  for (const name of fs.readdirSync(LIBRARY)) {
    const file = path.join(LIBRARY, name, 'style.css');
    if (fs.existsSync(file)) css[name] = minify(fs.readFileSync(file, 'utf8'));
  }
  return css;
}

function htmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Options:
 *   brand        defineBrand() result or its input; optional (no brand CSS or brand.json without it)
 *   contentRoot  where src/assets/uploads and public/media live; defaults to the Astro root
 *                (the deploy workflow copies the content repo's files into the source checkout)
 *   widths       { containerMax, wideMax, narrowMax } in px, matching the site's CSS
 *   mediaBase    URL prefix of the AVIF files and fallbacks (default '/media/')
 *   budget       byte limits for checkPage ({ css, js }), or false to skip the checks
 *   strict       fail the build when the budget or the brand reports a problem (default false)
 */
export default function siteAdmin(options = {}) {
  const brand = options.brand ? (options.brand.schema ? options.brand : defineBrand(options.brand)) : null;
  const mediaBase = options.mediaBase || '/media/';
  let contentRoot = options.contentRoot ? path.resolve(options.contentRoot) : null;

  const plugin = {
    name: 'site-admin:astro',
    resolveId(id) {
      if (id === CONFIG_ID) return RESOLVED_CONFIG;
      if (id === BRAND_ID) return RESOLVED_BRAND;
      return null;
    },
    load(id) {
      if (id === RESOLVED_BRAND) return brand ? brandCss(brand) : '';
      if (id !== RESOLVED_CONFIG) return null;
      // Read fresh on every load, so an upload made while `astro dev` runs is picked up.
      const manifestFile = mediaPaths(contentRoot).manifest;
      if (this.addWatchFile && fs.existsSync(manifestFile)) this.addWatchFile(manifestFile);
      const config = {
        engine: ENGINE_VERSION,
        mediaBase,
        widths: options.widths || {},
        manifest: readManifest(contentRoot),
        css: elementStyles(),
      };
      return `export default ${JSON.stringify(config)};`;
    },
  };

  return {
    name: 'site-admin',
    hooks: {
      'astro:config:setup'({ config, updateConfig, injectScript }) {
        contentRoot ||= fileURLToPath(config.root);
        updateConfig({
          build: { inlineStylesheets: 'always' },
          vite: {
            plugins: [plugin],
            // The runtime imports the virtual module, so Vite must bundle it rather than load it from node_modules.
            ssr: { noExternal: ['site-admin'] },
          },
        });
        if (brand) injectScript('page-ssr', `import ${JSON.stringify(BRAND_ID)};`);
      },

      // `astro dev`: serve each fallback from its upload, under the name the build gives it.
      'astro:server:setup'({ server }) {
        server.middlewares.use((req, res, next) => {
          const url = decodeURIComponent((req.url || '').split('?')[0]);
          if (!url.startsWith(mediaBase)) return next();
          const wanted = url.slice(mediaBase.length);
          const { entries } = readManifest(contentRoot);
          const name = Object.keys(entries).find(n => fallbackFileName(n, entries[n].hash) === wanted);
          if (!name) return next();
          const file = path.join(mediaPaths(contentRoot).uploads, name);
          if (!fs.existsSync(file)) return next();
          res.setHeader('Content-Type', /\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : 'image/webp');
          fs.createReadStream(file).pipe(res);
        });
      },

      'astro:build:done'({ dir, logger }) {
        const out = fileURLToPath(dir);
        const failures = [];

        const copied = copyFallbacks(contentRoot, path.join(out, ...mediaBase.split('/').filter(Boolean)));
        logger.info(`engine ${ENGINE_VERSION}: copied ${copied} image fallback${copied === 1 ? '' : 's'}`);

        if (brand) {
          const json = { ...brandJson(brand), engine: ENGINE_VERSION };
          fs.mkdirSync(path.join(out, '_ascend'), { recursive: true });
          fs.writeFileSync(path.join(out, '_ascend', 'brand.json'), JSON.stringify(json, null, 2) + '\n');
          for (const problem of json.problems) {
            logger.warn(`brand: ${problem}`);
            failures.push(problem);
          }
        }

        if (options.budget !== false) {
          let pages = 0;
          for (const file of htmlFiles(out)) {
            const html = fs.readFileSync(file, 'utf8');
            if (!html.includes(BUILDER_MARKER)) continue;
            pages++;
            const page = '/' + path.relative(out, file).split(path.sep).join('/');
            for (const problem of checkPage(html, options.budget || {}).problems) {
              logger.warn(`${page}: ${problem.message} [${problem.rule}]`);
              failures.push(`${page}: ${problem.message}`);
            }
          }
          if (pages) logger.info(`performance budget checked on ${pages} builder page${pages === 1 ? '' : 's'}`);
        }

        if (options.strict && failures.length) {
          throw new Error(`site-admin: ${failures.length} problem${failures.length === 1 ? '' : 's'} (strict mode). First: ${failures[0]}`);
        }
      },
    },
  };
}

export { siteAdmin };
