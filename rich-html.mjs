import crypto from 'crypto';
import fsp from 'fs/promises';
import path from 'path';
import { parse, serialize } from 'parse5';
import sharp from 'sharp';

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const MAX_EMBEDDED_IMAGES = 50;
const DATA_IMAGE_PATTERN = /data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)/gi;

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
        if (type !== 'application/ld+json') {
          if (src) {
            scriptParts.push(`await new Promise((resolve, reject) => {\n  const script = document.createElement('script');\n  script.src = ${JSON.stringify(src)};\n  script.onload = resolve;\n  script.onerror = reject;\n  document.head.appendChild(script);\n});`);
            report.externalResources += 1;
          }
          const code = textContent(node).trim();
          if (code) scriptParts.push(code);
          report.scriptBlocks += 1;
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
  return { html: serialize(body || document), title, description, cssParts, scriptParts, eventScripts };
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

export async function sortChatGptHtml({ source, outputDir, publicBase }) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Paste the HTML from ChatGPT first.');
  if (Buffer.byteLength(source) > MAX_IMPORT_BYTES) throw new Error('That ChatGPT paste is over 15 MB. Split it into smaller sections and try again.');

  const report = { images: 0, styleBlocks: 0, inlineStyles: 0, scriptBlocks: 0, eventHandlers: 0, externalResources: 0 };
  const extracted = extractDocument(parse(unwrapCodeFence(source)), report);
  const dataUrls = collectDataImages([extracted.html, ...extracted.cssParts, ...extracted.scriptParts, ...extracted.eventScripts]);
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

  const html = replaceEvery(extracted.html, replacements);
  const css = replaceEvery(extracted.cssParts.filter(Boolean).join('\n\n').trim(), replacements);
  const rawScripts = replaceEvery([...extracted.scriptParts, ...extracted.eventScripts].filter(Boolean).join('\n\n').trim(), replacements);

  await fsp.rm(outputDir, { recursive: true, force: true });
  await fsp.mkdir(outputDir, { recursive: true });
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
  };
}
