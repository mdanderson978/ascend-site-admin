import crypto from 'crypto';
import fsp from 'fs/promises';
import path from 'path';
import vm from 'node:vm';
import { parse, serialize, serializeOuter } from 'parse5';
import sharp from 'sharp';

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const MAX_EMBEDDED_IMAGES = 50;
const DATA_IMAGE_PATTERN = /data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)/gi;
// A data: URI for anything other than an image - a PDF, a font, a zip,
// whatever - isn't rehosted the way DATA_IMAGE_PATTERN rehosts images, so it
// would otherwise pass straight through as permanent dead weight in the
// saved page (embedded once, never reachable by its own URL, no way to
// replace it without re-pasting the whole page).
const DATA_NON_IMAGE_PATTERN = /data:(?!image\/)[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/gi;
// ChatGPT has no access to this site's filesystem, so when asked for a real
// downloadable file (a PDF guide, etc.) it sometimes improvises: embed the
// whole file as a giant base64 string literal in a <script>, decode it with
// atob() in the visitor's browser, and hand it out via
// Blob()/createObjectURL(). It works, but it ships the file as
// unreplaceable dead code with no real URL and no way to update it except
// re-pasting the entire page - exactly the anti-pattern DATA_NON_IMAGE_PATTERN
// blocks for a plain data: URI, just spelled differently. Both signals
// (atob decoding + Blob/createObjectURL reconstruction) appearing in the
// same script is specific enough not to false-positive on ordinary
// clipboard/share code that uses one or the other alone.
const BASE64_BLOB_RECONSTRUCTION_PATTERN = /\batob\s*\(/i;
const BLOB_URL_PATTERN = /\b(?:new\s+Blob\s*\(|createObjectURL\s*\()/i;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function unwrapCodeFence(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:html|md|markdown)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return match ? match[1] : value;
}

function attribute(node, name) {
  return node.attrs?.find(item => item.name === name);
}

function textContent(node) {
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(textContent).join('');
}

function findElement(node, tagName) {
  if (node.tagName === tagName) return node;
  for (const child of node.childNodes || []) {
    const found = findElement(child, tagName);
    if (found) return found;
  }
  return null;
}

function extractDocument(document, report) {
  const cssParts = [];
  const scriptParts = [];
  const eventScripts = [];
  const structuredData = [];
  let title = '';
  let description = '';

  function visit(parent) {
    const children = parent.childNodes || [];
    for (let index = 0; index < children.length;) {
      const node = children[index];
      const tag = node.tagName?.toLowerCase();

      if (tag === 'title') {
        if (!title) title = textContent(node).trim();
        children.splice(index, 1);
        continue;
      }

      if (tag === 'meta') {
        if (!description && attribute(node, 'name')?.value.toLowerCase() === 'description') {
          description = attribute(node, 'content')?.value.trim() || '';
        }
        children.splice(index, 1);
        continue;
      }

      if (tag === 'base') {
        children.splice(index, 1);
        continue;
      }

      if (tag === 'style') {
        const css = textContent(node).trim();
        if (css) cssParts.push(css);
        report.styleBlocks += 1;
        children.splice(index, 1);
        continue;
      }

      if (tag === 'script') {
        const type = attribute(node, 'type')?.value.toLowerCase() || '';
        const src = attribute(node, 'src')?.value || '';
        const isJavaScript = !type || /^(?:text|application)\/(?:java|ecma)script$/.test(type) || type === 'module';
        if (type === 'application/ld+json') {
          // Structured data is inert and belongs in the rendered document.
          // Move it into the returned body even when parse5 placed it in head.
          structuredData.push(serializeOuter(node));
          children.splice(index, 1);
          continue;
        }
        if (isJavaScript) {
          if (src) {
            scriptParts.push(`await new Promise((resolve, reject) => {\n  const script = document.createElement('script');\n  script.src = ${JSON.stringify(src)};\n  script.onload = resolve;\n  script.onerror = reject;\n  document.head.appendChild(script);\n});`);
            report.externalResources += 1;
          }
          const code = textContent(node).trim();
          if (code) scriptParts.push(code);
          report.scriptBlocks += 1;
        } else {
          report.skippedScripts += 1;
        }
        children.splice(index, 1);
        continue;
      }

      if (tag === 'link') {
        const rel = attribute(node, 'rel')?.value.toLowerCase() || '';
        const href = attribute(node, 'href')?.value || '';
        if (rel.split(/\s+/).includes('stylesheet') && href) {
          cssParts.unshift(`@import url(${JSON.stringify(href)});`);
          report.externalResources += 1;
        }
        children.splice(index, 1);
        continue;
      }

      if (node.attrs) {
        const inlineStyle = attribute(node, 'style');
        if (inlineStyle) {
          report.inlineStyles += 1;
        }

        for (const eventAttribute of [...node.attrs].filter(item => /^on[a-z]+$/i.test(item.name))) {
          const eventName = eventAttribute.name.slice(2).toLowerCase();
          const marker = `data-cms-event-${report.eventHandlers + 1}`;
          node.attrs = node.attrs.filter(item => item !== eventAttribute);
          node.attrs.push({ name: marker, value: '' });
          eventScripts.push(`document.querySelector('[${marker}]')?.addEventListener(${JSON.stringify(eventName)}, function (event) {\n${eventAttribute.value}\n});`);
          report.eventHandlers += 1;
        }
      }

      visit(node);
      index += 1;
    }
  }

  visit(document);
  const body = findElement(document, 'body');
  return { html: [serialize(body || document), ...structuredData].filter(Boolean).join('\n'), title, description, cssParts, scriptParts, eventScripts };
}

// Throws if the paste tries to smuggle a real file in as inline data instead
// of a proper upload - see DATA_NON_IMAGE_PATTERN and
// BASE64_BLOB_RECONSTRUCTION_PATTERN above for why this needs blocking
// outright rather than silently importing it. Checked separately from
// collectDataImages() because these aren't rehostable the way embedded
// images are - there's no automatic fix, the paste has to change.
function assertNoEmbeddedFileBlobs(values) {
  for (const value of values) {
    DATA_NON_IMAGE_PATTERN.lastIndex = 0;
    if (DATA_NON_IMAGE_PATTERN.test(value)) {
      throw new Error('This paste embeds a file (e.g. a PDF) as raw data instead of a real link. Save that file and add it with the page\'s own PDF/file upload field instead of asking ChatGPT to build the download into the page.');
    }
    if (BASE64_BLOB_RECONSTRUCTION_PATTERN.test(value) && BLOB_URL_PATTERN.test(value)) {
      throw new Error('This paste rebuilds a downloadable file from embedded data in its own script instead of linking to a real file. Save that file and add it with the page\'s own PDF/file upload field instead of asking ChatGPT to build the download into the page.');
    }
  }
}

function collectDataImages(values) {
  const images = new Set();
  for (const value of values) {
    DATA_IMAGE_PATTERN.lastIndex = 0;
    for (const match of value.matchAll(DATA_IMAGE_PATTERN)) images.add(match[0]);
  }
  return [...images];
}

function replaceEvery(value, replacements) {
  for (const [from, to] of replacements) value = value.split(from).join(to);
  return value;
}

function ownSiteHosts(siteUrl) {
  if (!siteUrl) return new Set();
  try {
    const host = new URL(siteUrl).host.toLowerCase();
    const bare = host.replace(/^www\./, '');
    return new Set([host, bare, `www.${bare}`]);
  } catch {
    return new Set();
  }
}

function normalizeOwnHostUrls(value, siteUrl) {
  const hosts = ownSiteHosts(siteUrl);
  if (!hosts.size) return value;
  const normalizeSegment = segment => segment.replace(/https?:\/\/[^\s"'`<>)]+/gi, full => {
    try {
      const url = new URL(full);
      if (!hosts.has(url.host.toLowerCase())) return full;
      if (!url.pathname.startsWith('/content-assets/') && !url.pathname.startsWith('/documents/')) return full;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return full;
    }
  });
  // Structured data is an exact external contract. Even a site-owned asset
  // URL inside it must stay byte-for-byte as ChatGPT supplied it.
  const structuredData = /(<script\b[^>]*\btype="application\/ld\+json"[^>]*>[\s\S]*?<\/script>)/gi;
  return value.split(structuredData).map(part => /^<script\b/i.test(part) && /\btype="application\/ld\+json"/i.test(part) ? part : normalizeSegment(part)).join('');
}

const ASSET_FILE_EXTENSION = /\.(?:avif|css|gif|ico|jpe?g|js|json|pdf|png|svg|webp|woff2?|ttf|otf|mp4|webm|mp3|wav)$/i;

function normalizeHtmlRelativeAssetUrls(html, publicBase) {
  let repaired = 0;
  function normalize(url) {
    const clean = url.split(/[?#]/, 1)[0];
    if (/^(?:\.\/)?images\//i.test(clean)) {
      repaired += 1;
      return `${publicBase}/${url.replace(/^\.\//, '')}`;
    }
    if (!/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url) && ASSET_FILE_EXTENSION.test(clean)) {
      throw new Error(`This paste uses the relative file URL ${url}. Upload the file first and give ChatGPT the exact path shown by Ascend Site Admin.`);
    }
    return url;
  }

  const normalized = html.replace(/\b(src|href|poster)="([^"]*)"/gi, (full, name, url) => `${name}="${normalize(url)}"`);
  return {
    html: normalized.replace(/\bsrcset="([^"]*)"/gi, (full, value) => {
      const candidates = value.split(',').map(candidate => {
        const parts = candidate.trim().split(/\s+/);
        parts[0] = normalize(parts[0]);
        return parts.join(' ');
      });
      return `srcset="${candidates.join(', ')}"`;
    }),
    repaired,
  };
}

function cleanLocalReference(reference) {
  return reference.replace(/[;,]+$/, '').split(/[?#]/, 1)[0];
}

function collectLocalAssetReferences(values) {
  const references = new Set();
  // A local root-relative URL starts with one slash. The lookbehind avoids
  // treating the second slash in https://cdn.example/file.js as local.
  const pattern = /(?<![:/])\/(?!\/)[^\s"'`<>)]+/g;
  for (const value of values) {
    const withoutExternalUrls = value.replace(/(?:https?:)?\/\/[^\s"'`<>)]+/gi, '');
    for (const match of withoutExternalUrls.matchAll(pattern)) {
      const reference = match[0].replace(/[;,}\]]+$/, '');
      const clean = cleanLocalReference(reference);
      if (clean.startsWith('/_astro/') || clean.startsWith('/content-assets/') || clean.startsWith('/documents/') || ASSET_FILE_EXTENSION.test(clean)) {
        references.add(reference);
      }
    }
  }
  return [...references];
}

async function repairPageImageReferences(values, { outputDir, publicBase, plannedImages }) {
  const imagePrefix = `${publicBase}/images/`;
  const references = collectLocalAssetReferences(values);
  let names = [];
  try { names = await fsp.readdir(path.join(outputDir, 'images')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const replacements = [];
  for (const reference of references) {
    const cleanPath = cleanLocalReference(reference);
    if (!cleanPath.startsWith(imagePrefix)) continue;
    let name;
    try { name = decodeURIComponent(cleanPath.slice(imagePrefix.length)); }
    catch { throw new Error(`This paste contains an invalid image URL: ${cleanPath}`); }
    if (!name || name.includes('/')) continue;
    if (plannedImages.has(name) || names.includes(name)) continue;
    const candidates = names.filter(candidate => new RegExp(`^\\d{13}-${escapeRegExp(name)}$`).test(candidate));
    if (candidates.length === 1) replacements.push([cleanPath, `${imagePrefix}${candidates[0]}`]);
  }
  return { values: values.map(value => replaceEvery(value, replacements)), repaired: replacements.length };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertValidJavaScript(js) {
  if (!js) return;
  try {
    new vm.Script(`(async () => {\n${js}\n})();\n`);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(`The pasted page JavaScript has a syntax error and was not imported: ${error.message}. Ask ChatGPT to return one browser script without import statements or duplicate declarations.`);
  }
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertLocalAssetsExist(values, { outputDir, publicDir, publicBase, plannedPaths }) {
  const references = collectLocalAssetReferences(values);
  const missing = [];
  for (const reference of references) {
    const clean = cleanLocalReference(reference);
    if (clean.startsWith('/_astro/')) {
      throw new Error(`This paste contains the build-generated URL ${clean}. Ask ChatGPT to use an uploaded image or document URL instead; /_astro/ files change on every build.`);
    }
    if (plannedPaths.has(clean)) continue;

    let decoded;
    try { decoded = decodeURIComponent(clean); }
    catch { throw new Error(`This paste contains an invalid local asset URL: ${clean}`); }

    let filePath = null;
    if (decoded === publicBase || decoded.startsWith(`${publicBase}/`)) {
      filePath = path.resolve(outputDir, `.${decoded.slice(publicBase.length)}`);
      if (!isInside(outputDir, filePath)) throw new Error(`This paste contains an unsafe local asset URL: ${clean}`);
    } else if (publicDir) {
      filePath = path.resolve(publicDir, `.${decoded}`);
      if (!isInside(publicDir, filePath)) throw new Error(`This paste contains an unsafe local asset URL: ${clean}`);
    }
    if (!filePath) continue;
    try {
      if (!(await fsp.stat(filePath)).isFile()) missing.push(clean);
    } catch (error) {
      if (error.code === 'ENOENT') missing.push(clean);
      else throw error;
    }
  }
  if (missing.length) {
    throw new Error(`This paste refers to files that are not available on the site: ${[...new Set(missing)].join(', ')}. Upload them first, copy their exact paths into ChatGPT, and paste the corrected page again.`);
  }
  return references.length;
}

const LOCK_ERROR_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const FILE_IN_USE_MESSAGE = 'A file for this page is in use. Close any image previews and try the import again.';

async function renameDirectoryWithRetry(from, to, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { await fsp.rename(from, to); return; }
    catch (error) {
      if (!LOCK_ERROR_CODES.has(error.code)) throw error;
      if (attempt === attempts - 1) throw new Error(FILE_IN_USE_MESSAGE, { cause: error });
      await new Promise(resolve => setTimeout(resolve, Math.min(100 * (2 ** attempt), 800)));
    }
  }
}

async function replaceAssetDirectory({ outputDir, stagingDir, html, css, js, convertedImages, publicBase }) {
  const transactionParent = stagingDir || path.join(path.dirname(outputDir), '.chatgpt-import-staging');
  await fsp.mkdir(transactionParent, { recursive: true });
  const transactionDir = await fsp.mkdtemp(path.join(transactionParent, 'chatgpt-'));
  const stagedDir = path.join(transactionDir, 'next');
  const backupDir = path.join(transactionDir, 'previous');
  let hadExisting = false;

  try {
    try {
      await fsp.cp(outputDir, stagedDir, { recursive: true, errorOnExist: true });
      hadExisting = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fsp.mkdir(stagedDir, { recursive: true });
    }

    for (const name of await fsp.readdir(stagedDir)) {
      if (/^page-[a-f0-9]+\.(?:css|js)$/i.test(name)) await fsp.rm(path.join(stagedDir, name));
    }

    const stillUsed = [html, css, js].join('\n');
    const imageDir = path.join(stagedDir, 'images');
    try {
      for (const name of await fsp.readdir(imageDir)) {
        if (/^image-[a-f0-9]+\.webp$/i.test(name) && !stillUsed.includes(`${publicBase}/images/${name}`)) {
          await fsp.rm(path.join(imageDir, name));
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (convertedImages.length) await fsp.mkdir(imageDir, { recursive: true });
    for (const image of convertedImages) await fsp.writeFile(path.join(imageDir, image.filename), image.webP);

    const styleName = css ? `page-${hash(css)}.css` : '';
    const scriptName = js ? `page-${hash(js)}.js` : '';
    if (css) await fsp.writeFile(path.join(stagedDir, styleName), css + '\n', 'utf8');
    if (js) await fsp.writeFile(path.join(stagedDir, scriptName), js, 'utf8');

    await fsp.mkdir(path.dirname(outputDir), { recursive: true });
    if (hadExisting) await renameDirectoryWithRetry(outputDir, backupDir);
    try {
      await renameDirectoryWithRetry(stagedDir, outputDir);
    } catch (error) {
      if (hadExisting) await renameDirectoryWithRetry(backupDir, outputDir);
      throw error;
    }
    return { styleName, scriptName };
  } finally {
    await fsp.rm(transactionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(error => {
      console.warn(`Could not clean up ChatGPT import staging files: ${error.message}`);
    });
  }
}

export async function sortChatGptHtml({ source, outputDir, publicBase, publicDir = '', siteUrl = '', stagingDir = '' }) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Paste the HTML from ChatGPT first.');
  if (Buffer.byteLength(source) > MAX_IMPORT_BYTES) throw new Error('That ChatGPT paste is over 15 MB. Split it into smaller sections and try again.');

  const report = { images: 0, styleBlocks: 0, inlineStyles: 0, scriptBlocks: 0, skippedScripts: 0, eventHandlers: 0, externalResources: 0, localAssets: 0, repairedImages: 0 };
  const extracted = extractDocument(parse(unwrapCodeFence(source)), report);
  const extractedValues = [extracted.html, ...extracted.cssParts, ...extracted.scriptParts, ...extracted.eventScripts];
  assertNoEmbeddedFileBlobs(extractedValues);
  const dataUrls = collectDataImages(extractedValues);
  if (dataUrls.length > MAX_EMBEDDED_IMAGES) throw new Error(`That paste contains ${dataUrls.length} embedded images. The limit is ${MAX_EMBEDDED_IMAGES} per page.`);

  const convertedImages = [];
  const replacements = [];
  for (const dataUrl of dataUrls) {
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1).replace(/\s/g, '');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('One embedded image is empty or over 25 MB.');
    const filename = `image-${hash(bytes)}.webp`;
    const publicPath = `${publicBase}/images/${filename}`;
    let webP;
    try { webP = await sharp(bytes).webp({ quality: 82 }).toBuffer(); }
    catch { throw new Error('One embedded image is invalid and could not be imported. Ask ChatGPT to remove that image, or upload the original image through Page images first.'); }
    convertedImages.push({ filename, webP, publicPath });
    replacements.push([dataUrl, publicPath]);
  }
  report.images = convertedImages.length;

  const normalized = [
    extracted.html,
    extracted.cssParts.filter(Boolean).join('\n\n').trim(),
    [...extracted.scriptParts, ...extracted.eventScripts].filter(Boolean).join('\n\n').trim(),
  ].map(value => normalizeOwnHostUrls(replaceEvery(value, replacements), siteUrl));
  const relativeHtml = normalizeHtmlRelativeAssetUrls(normalized[0], publicBase);
  normalized[0] = relativeHtml.html;
  const repaired = await repairPageImageReferences(normalized, {
    outputDir,
    publicBase,
    plannedImages: new Set(convertedImages.map(image => image.filename)),
  });
  const [html, css, rawScripts] = repaired.values;
  report.repairedImages = repaired.repaired + relativeHtml.repaired;
  assertValidJavaScript(rawScripts);
  const js = rawScripts ? `(async () => {\n${rawScripts}\n})();\n` : '';
  const styleName = css ? `page-${hash(css)}.css` : '';
  const scriptName = js ? `page-${hash(js)}.js` : '';
  const plannedPaths = new Set(convertedImages.map(image => image.publicPath));
  if (styleName) plannedPaths.add(`${publicBase}/${styleName}`);
  if (scriptName) plannedPaths.add(`${publicBase}/${scriptName}`);
  report.localAssets = await assertLocalAssetsExist([html, css, rawScripts], { outputDir, publicDir, publicBase, plannedPaths });
  await replaceAssetDirectory({ outputDir, stagingDir, html, css, js, convertedImages, publicBase });

  return {
    body: html.trim() + '\n',
    title: extracted.title,
    description: extracted.description,
    assets: {
      style: styleName ? `${publicBase}/${styleName}` : '',
      script: scriptName ? `${publicBase}/${scriptName}` : '',
      images: convertedImages.map(image => image.publicPath),
    },
    report,
    warnings: [],
  };
}
