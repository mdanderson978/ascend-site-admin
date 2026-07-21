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
    openBrowserOnStart: false,
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
    const start = html.indexOf('<script>') + 8;
    const end = html.lastIndexOf('</script>');
    assert(start >= 8 && end > start, 'Admin inline script is missing');
    new Function(html.slice(start, end));

    const hostile = await fetch(base + '/api/config', { headers: { Origin: 'https://hostile.invalid' } });
    assert(hostile.status === 403, `Hostile origin returned ${hostile.status}, expected 403`);

    const traversal = await request(base, '/api/preview?p=public/../../package.json');
    assert(traversal.status === 403, `Preview traversal returned ${traversal.status}, expected 403`);

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
