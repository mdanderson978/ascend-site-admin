import fs from 'node:fs';
import path from 'node:path';
import { startAdmin } from './index.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(base, pathname, options = {}) {
  const response = await fetch(base + pathname, {
    ...options,
    headers: { Origin: base, ...(options.headers || {}) },
  });
  return response;
}

export async function verifySite(config, { root, port = 4399 } = {}) {
  const resolvedRoot = path.resolve(root || config.root || '.');
  const server = startAdmin({
    ...config,
    root: resolvedRoot,
    port,
    pullOnStart: false,
  });

  try {
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
    }

    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const base = `http://127.0.0.1:${actualPort}`;

    const configResponse = await request(base, '/api/config');
    assert(configResponse.ok, `/api/config returned ${configResponse.status}`);
    const publicConfig = await configResponse.json();
    assert(publicConfig.siteTitle === config.siteTitle, 'Site title does not survive /api/config');

    const contentResponse = await request(base, '/api/content');
    assert(contentResponse.ok, `/api/content returned ${contentResponse.status}`);

    const searchResponse = await request(base, '/api/search');
    assert(searchResponse.ok, `/api/search returned ${searchResponse.status}`);
    const search = await searchResponse.json();

    for (const key of Object.keys(config.fields || {})) {
      const pageResponse = await request(base, `/api/content/${key}`);
      assert(pageResponse.ok, `${key} returned ${pageResponse.status}`);
      assert(Object.hasOwn(search, key), `${key} is missing from the search index`);
    }

    const htmlResponse = await request(base, '/');
    assert(htmlResponse.ok, `/ returned ${htmlResponse.status}`);
    const html = await htmlResponse.text();
    assert(html.includes('<div id="root"></div>') || html.includes('<script>'), 'Admin application shell is missing');
    for (const asset of [...html.matchAll(/(?:src|href)="(\/admin-assets\/[^"]+)"/g)].map(match => match[1])) {
      const assetResponse = await request(base, asset);
      assert(assetResponse.ok, `${asset} returned ${assetResponse.status}`);
      await assetResponse.arrayBuffer();
    }

    const legacyResponse = await request(base, '/legacy');
    assert(legacyResponse.ok, `/legacy returned ${legacyResponse.status}`);
    const legacyHtml = await legacyResponse.text();
    const start = legacyHtml.indexOf('<script>') + 8;
    const end = legacyHtml.lastIndexOf('</script>');
    assert(start >= 8 && end > start, 'Legacy admin inline script is missing');
    new Function(legacyHtml.slice(start, end));

    const hostile = await fetch(base + '/api/config', { headers: { Origin: 'https://hostile.invalid' } });
    assert(hostile.status === 403, `Hostile origin returned ${hostile.status}, expected 403`);

    const traversal = await request(base, '/api/preview?p=public/../../package.json');
    assert(traversal.status === 403, `Preview traversal returned ${traversal.status}, expected 403`);

    // Rename must refuse a key that is neither a dynamic-collection entry
    // nor explicitly listed in config.renamable, regardless of whether this
    // site configures either — the gate itself must exist and hold.
    const renameGuard = await request(base, '/api/rename/pages/__verify-rename-guard__/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSlug: 'whatever' }),
    });
    assert(renameGuard.status === 400, `Unguarded rename returned ${renameGuard.status}, expected 400`);

    return {
      ok: true,
      siteTitle: config.siteTitle,
      pages: Object.keys(config.fields || {}).length,
      engineVersion: JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version,
    };
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}
