import crypto from 'crypto';
import fsp from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const MAX_EMBEDDED_IMAGES = 50;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function unwrapCodeFence(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:html|md|markdown)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return match ? match[1] : value;
}

function addClass(attributes, className) {
  const classPattern = /\sclass\s*=\s*(["'])(.*?)\1/i;
  if (classPattern.test(attributes)) return attributes.replace(classPattern, (_full, quote, names) => ` class=${quote}${names} ${className}${quote}`);
  return `${attributes} class="${className}"`;
}

function addDataMarker(attributes, marker) {
  return `${attributes} ${marker}=""`;
}

export async function sortChatGptHtml({ source, outputDir, publicBase }) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Paste the HTML from ChatGPT first.');
  if (Buffer.byteLength(source) > MAX_IMPORT_BYTES) throw new Error('That ChatGPT paste is over 15 MB. Split it into smaller sections and try again.');

  let html = unwrapCodeFence(source).replace(/^\s*<!doctype[^>]*>/i, '');
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
  const description = html.match(/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*(["'])(.*?)\1[^>]*>/i)?.[2]?.trim()
    || html.match(/<meta\b[^>]*\bcontent\s*=\s*(["'])(.*?)\1[^>]*\bname\s*=\s*["']description["'][^>]*>/i)?.[2]?.trim()
    || '';

  const report = { images: 0, styleBlocks: 0, inlineStyles: 0, scriptBlocks: 0, eventHandlers: 0, externalResources: 0 };
  const imageDir = path.join(outputDir, 'images');
  const dataUrls = [...new Set([...html.matchAll(/data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)/gi)].map(match => match[0]))];
  if (dataUrls.length > MAX_EMBEDDED_IMAGES) throw new Error(`That paste contains ${dataUrls.length} embedded images. The limit is ${MAX_EMBEDDED_IMAGES} per page.`);

  const convertedImages = [];
  for (const dataUrl of dataUrls) {
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1).replace(/\s/g, '');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error('One embedded image is empty or over 25 MB.');
    const filename = `image-${hash(bytes)}.webp`;
    const publicPath = `${publicBase}/images/${filename}`;
    convertedImages.push({ filename, bytes, publicPath });
    html = html.split(dataUrl).join(publicPath);
  }
  report.images = convertedImages.length;

  const cssParts = [];
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_full, css) => {
    cssParts.push(css.trim()); report.styleBlocks += 1; return '';
  });

  const scriptParts = [];
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_full, attributes, code) => {
    const type = attributes.match(/\btype\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase() || '';
    const src = attributes.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
    if (type === 'application/ld+json') return '';
    if (src) {
      scriptParts.push(`await new Promise((resolve, reject) => {\n  const script = document.createElement('script');\n  script.src = ${JSON.stringify(src)};\n  script.onload = resolve;\n  script.onerror = reject;\n  document.head.appendChild(script);\n});`);
      report.externalResources += 1;
    }
    if (code.trim()) scriptParts.push(code.trim());
    report.scriptBlocks += 1;
    return '';
  });

  html = html.replace(/<link\b([^>]*)>/gi, (_full, attributes) => {
    const rel = attributes.match(/\brel\s*=\s*(["'])(.*?)\1/i)?.[2]?.toLowerCase() || '';
    const href = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
    if (rel.includes('stylesheet') && href) {
      cssParts.unshift(`@import url(${JSON.stringify(href)});`);
      report.externalResources += 1;
    }
    return '';
  });

  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body) html = body[1];
  html = html
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '')
    .replace(/<(?:meta|base)\b[^>]*>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');

  const eventScripts = [];
  html = html.replace(/<([A-Za-z][\w:-]*)([^<>]*?)>/g, (_full, tag, originalAttributes) => {
    let attributes = originalAttributes;
    const styleMatch = attributes.match(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i);
    if (styleMatch) {
      const className = `cms-inline-${hash(styleMatch[2])}`;
      cssParts.push(`.${className} { ${styleMatch[2].trim()} }`);
      attributes = attributes.replace(styleMatch[0], '');
      attributes = addClass(attributes, className);
      report.inlineStyles += 1;
    }

    const eventPattern = /\s(on[a-z]+)\s*=\s*(["'])([\s\S]*?)\2/i;
    let eventMatch;
    while ((eventMatch = attributes.match(eventPattern))) {
      const eventName = eventMatch[1].slice(2).toLowerCase();
      const marker = `data-cms-event-${report.eventHandlers + 1}`;
      attributes = attributes.replace(eventMatch[0], '');
      attributes = addDataMarker(attributes, marker);
      eventScripts.push(`document.querySelector('[${marker}]')?.addEventListener(${JSON.stringify(eventName)}, function (event) {\n${eventMatch[3]}\n});`);
      report.eventHandlers += 1;
    }
    return `<${tag}${attributes}>`;
  });

  await fsp.rm(outputDir, { recursive: true, force: true });
  await fsp.mkdir(outputDir, { recursive: true });
  if (convertedImages.length) {
    await fsp.mkdir(imageDir, { recursive: true });
    for (const image of convertedImages) {
      await sharp(image.bytes).webp({ quality: 82 }).toFile(path.join(imageDir, image.filename));
    }
  }

  const css = cssParts.filter(Boolean).join('\n\n').trim();
  const rawScripts = [...scriptParts, ...eventScripts].filter(Boolean).join('\n\n').trim();
  const js = rawScripts ? `(async () => {\n${rawScripts}\n})();\n` : '';
  const styleName = css ? `page-${hash(css)}.css` : '';
  const scriptName = js ? `page-${hash(js)}.js` : '';
  if (css) await fsp.writeFile(path.join(outputDir, styleName), css + '\n', 'utf8');
  if (js) await fsp.writeFile(path.join(outputDir, scriptName), js, 'utf8');

  return {
    body: html.trim() + '\n',
    title,
    description,
    assets: {
      style: styleName ? `${publicBase}/${styleName}` : '',
      script: scriptName ? `${publicBase}/${scriptName}` : '',
      images: convertedImages.map(image => image.publicPath),
    },
    report,
  };
}
