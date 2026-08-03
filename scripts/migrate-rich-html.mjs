import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { sortChatGptHtml } from '../rich-html.mjs';

const root = path.resolve(process.argv[2] || '');
if (!root || !fs.existsSync(path.join(root, 'src', 'content'))) {
  console.error('Usage: node scripts/migrate-rich-html.mjs <content-repo>');
  process.exit(1);
}

const candidates = [];
walk(path.join(root, 'src', 'content'));
for (const filename of candidates) {
  const source = fs.readFileSync(filename, 'utf8');
  const parsed = matter(source);
  if (!/<(?:style|script|html|head|body|link|meta)\b|<[A-Za-z][^>]*\sstyle\s*=|<[A-Za-z][^>]*\son[a-z]+\s*=|data:image\//i.test(parsed.content)) continue;
  const relative = path.relative(path.join(root, 'src', 'content'), filename).replace(/\\/g, '/');
  const [collection, ...rest] = relative.split('/');
  const slug = rest.join('/').replace(/\.md$/, '');
  const outputDir = path.join(root, 'public', 'content-assets', collection, slug);
  const result = await sortChatGptHtml({ source: parsed.content, outputDir, publicBase: `/content-assets/${collection}/${slug}` });
  fs.writeFileSync(filename, matter.stringify(result.body, parsed.data), 'utf8');
  console.log(`${relative}:`, result.report);
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (entry.isFile() && entry.name.endsWith('.md')) candidates.push(filename);
  }
}
