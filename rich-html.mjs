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
  return value.replace(/https?:\/\/[^\s"'`<>)]+/gi, full => {
    try {
      const url = new URL(full);
      if (!hosts.has(url.host.toLowerCase())) return full;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return full;
    }
  });
}

function collectLocalAssetReferences(values) {
  const references = new Set();
  const pattern = /\/(?:content-assets|documents)\/[^\s"'`<>)]+/gi;
  for (const value of values) {
    for (const match of value.matchAll(pattern)) {
      references.add(match[0].replace(/[;,]+$/, ''));
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
  const missing = [];
  for (const reference of references) {
    const cleanPath = reference.split(/[?#]/, 1)[0];
    if (!cleanPath.startsWith(imagePrefix)) continue;
    const name = decodeURIComponent(cleanPath.slice(imagePrefix.length));
    if (!name || name.includes('/')) continue;
    if (plannedImages.has(name) || names.includes(name)) continue;
    const candidates = names.filter(candidate => new RegExp(`^\\d{13}-${escapeRegExp(name)}$`).test(candidate));
    if (candidates.length === 1) {
      replacements.push([cleanPath, `${imagePrefix}${candidates[0]}`]);
    } else {
      missing.push(cleanPath);
    }
  }
  return {
    values: values.map(value => replaceEvery(value, replacements)),
    repaired: replacements.length,
    missing,
  };
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

// A slow browser download/preview reading one of these files can hold a
// Windows sharing lock on it for a moment (antivirus scanning it, Explorer
// generating a thumbnail, OneDrive syncing it). Real locks like that clear
// within milliseconds, so a short retry avoids failing the whole save over a
// purely transient collision. If it's still locked after that, skip it
// rather than crashing - it becomes an orphaned file (same tradeoff
// pruneOrphanUploads makes elsewhere in this engine), not a broken save.
async function removeStaleAssetFile(filePath, attempts = 3, delayMs = 150) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fsp.rm(filePath, { force: true });
      return;
    } catch (error) {
      if (attempt === attempts) {
        console.error(`  Could not remove ${filePath} (still in use) - leaving it in place: ${error.message}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export async function sortChatGptHtml({ source, outputDir, publicBase, siteUrl = '' }) {
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
    convertedImages.push({ filename, bytes, publicPath });
    replacements.push([dataUrl, publicPath]);
  }
  report.images = convertedImages.length;

  const normalized = [
    extracted.html,
    extracted.cssParts.filter(Boolean).join('\n\n').trim(),
    [...extracted.scriptParts, ...extracted.eventScripts].filter(Boolean).join('\n\n').trim(),
  ].map(value => normalizeOwnHostUrls(replaceEvery(value, replacements), siteUrl));
  const repaired = await repairPageImageReferences(normalized, {
    outputDir,
    publicBase,
    plannedImages: new Set(convertedImages.map(image => image.filename)),
  });
  const [html, css, rawScripts] = repaired.values;
  report.localAssets = collectLocalAssetReferences(repaired.values).length;
  report.repairedImages = repaired.repaired;
  assertValidJavaScript(rawScripts);

  await fsp.mkdir(outputDir, { recursive: true });
  for (const name of await fsp.readdir(outputDir)) {
    if (/^page-[a-f0-9]+\.(?:css|js)$/i.test(name)) await removeStaleAssetFile(path.join(outputDir, name));
  }
  // Images from an earlier import are only stale if the new paste no longer
  // uses them. A paste often links an existing image by its hosted path
  // (ChatGPT was handed the current page) instead of re-embedding it as a
  // data: URL, so deleting every image-*.webp here broke the page.
  const stillUsed = [html, css, rawScripts].join('\n');
  const existingImageDir = path.join(outputDir, 'images');
  try {
    for (const name of await fsp.readdir(existingImageDir)) {
      if (!/^image-[a-f0-9]+\.webp$/i.test(name)) continue;
      if (stillUsed.includes(`${publicBase}/images/${name}`)) continue;
      await removeStaleAssetFile(path.join(existingImageDir, name));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (convertedImages.length) {
    const imageDir = path.join(outputDir, 'images');
    await fsp.mkdir(imageDir, { recursive: true });
    for (const image of convertedImages) {
      await sharp(image.bytes).webp({ quality: 82 }).toFile(path.join(imageDir, image.filename));
    }
  }

  const js = rawScripts ? `(async () => {\n${rawScripts}\n})();\n` : '';
  const styleName = css ? `page-${hash(css)}.css` : '';
  const scriptName = js ? `page-${hash(js)}.js` : '';
  if (css) await fsp.writeFile(path.join(outputDir, styleName), css + '\n', 'utf8');
  if (js) await fsp.writeFile(path.join(outputDir, scriptName), js, 'utf8');

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
    warnings: repaired.missing.length
      ? [`These images aren't uploaded yet: ${repaired.missing.join(', ')}`]
      : [],
  };
}
