import fs from 'node:fs/promises';

const token = process.env.GH_TOKEN || process.env.ASCEND_INVENTORY_TOKEN;
if (!token) throw new Error('GH_TOKEN or ASCEND_INVENTORY_TOKEN is required');

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2026-03-10',
};

async function github(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, { headers });
  if (!response.ok) throw new Error(`${pathname}: ${response.status} ${await response.text()}`);
  return response.json();
}

function compareVersions(a, b) {
  const av = a.split('.').map(Number);
  const bv = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((av[i] || 0) !== (bv[i] || 0)) return (av[i] || 0) - (bv[i] || 0);
  }
  return 0;
}

const inventory = JSON.parse(await fs.readFile(new URL('../sites.json', import.meta.url), 'utf8'));
const tags = await github('/repos/mdanderson978/ascend-site-admin/tags?per_page=100');
const versions = tags.map(tag => tag.name.replace(/^v/, '')).filter(version => /^\d+\.\d+\.\d+$/.test(version));
versions.sort(compareVersions);
const latest = versions.at(-1);
if (!latest) throw new Error('No semantic-version engine tag found');

const rows = [];
for (const site of inventory.sites) {
  try {
    const file = await github(`/repos/${site.repository}/contents/package-lock.json`);
    const lock = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    const current = lock.packages?.['node_modules/site-admin']?.version || 'unknown';
    rows.push({ ...site, current, latest, status: current === latest ? 'Current' : 'Behind' });
  } catch (error) {
    rows.push({ ...site, current: 'unknown', latest, status: `Error: ${error.message}` });
  }
}

const lines = [
  '# site-admin fleet status',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '| Site | Repository | Installed | Latest | Status |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map(row => `| ${row.name} | ${row.repository} | ${row.current} | ${row.latest} | ${row.status} |`),
  '',
];

const report = lines.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, report);
console.log(report);

if (rows.some(row => row.status !== 'Current')) process.exitCode = 1;
