#!/usr/bin/env node
// site-admin-media: run from a content repo's root.
//
//   npx site-admin-media backfill   encode AVIF sets for uploads that lack a current one
//   npx site-admin-media prune      remove AVIF sets whose upload is gone
//   npx site-admin-media stats      what's stored, and how much it weighs
//
// Commit public/media/ afterwards (the admin's Publish does this for uploads
// made in the admin).

import fs from 'node:fs';
import path from 'node:path';
import { backfillMedia, mediaPaths, pruneMedia, readManifest } from './media.mjs';

const root = process.cwd();
const command = process.argv[2];
const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`;

if (!fs.existsSync(path.join(root, 'src', 'content'))) {
  console.error('Run this from a content repo (no src/content here).');
  process.exit(1);
}

if (command === 'backfill') {
  const started = Date.now();
  console.log('Encoding AVIF sets for uploads that need one...');
  const { encoded, total } = await backfillMedia(root, { log: line => console.log(line) });
  console.log(`Done: ${encoded.length} encoded, ${total - encoded.length} already up to date (${((Date.now() - started) / 1000).toFixed(1)} s).`);
  if (encoded.length) console.log('Commit public/media/ to publish them.');
} else if (command === 'prune') {
  const removed = await pruneMedia(root, { minAgeMs: 0 });
  console.log(removed.length ? `Removed ${removed.length} file(s): ${removed.join(', ')}` : 'Nothing to prune.');
} else if (command === 'stats') {
  const { uploads, media } = mediaPaths(root);
  const { entries } = readManifest(root);
  const size = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0) : 0);
  console.log(`${Object.keys(entries).length} uploads with AVIF sets`);
  console.log(`uploads:      ${mb(size(uploads))}`);
  console.log(`public/media: ${mb(size(media))}`);
} else {
  console.log('Usage: npx site-admin-media <backfill | prune | stats>');
  process.exit(command ? 1 : 0);
}
