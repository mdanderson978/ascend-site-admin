import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { startAdmin } from '../../index.mjs';

let root;
let remote;
let server;
let photoPath;

test.beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-v2-e2e-'));
  remote = fs.mkdtempSync(path.join(os.tmpdir(), 'site-admin-v2-remote-'));
  fs.mkdirSync(path.join(root, 'src/content/pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/content/projects'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/assets/uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/documents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/content/pages/home.md'), '---\ntitle: Home\nhero:\n  src: ""\n  alt: ""\n---\nWelcome to the test site.\n');
  fs.writeFileSync(path.join(root, 'src/content/projects/alpha.md'), '---\ntitle: Alpha\norder: 1\n---\n');
  fs.writeFileSync(path.join(root, 'src/content/projects/beta.md'), '---\ntitle: Beta\norder: 2\n---\n');
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'E2E Admin'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'e2e@example.invalid'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'Initial content'], { cwd: root });
  execFileSync('git', ['init', '--bare'], { cwd: remote });
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
  execFileSync('git', ['push', '-u', 'origin', 'HEAD'], { cwd: root });
  photoPath = path.join(root, 'test-photo.png');
  await sharp({ create: { width: 1300, height: 700, channels: 3, background: '#476c5f' } }).png().toFile(photoPath);
  server = startAdmin({
    root, port: 4432, pullOnStart: false, richHtmlImport: true, siteTitle: 'V2 Test Site', developerName: 'Test Developer', developerEmail: 'developer@example.invalid',
    pageLabels: { 'pages/home': 'Home page' },
    navStructure: [{ label: 'Website', breadcrumb: false, items: [{ key: 'pages/home' }, { dynamic: 'projects' }] }],
    fields: { 'pages/home': [{ name: 'title', label: 'Page title', type: 'string', required: true }, { name: 'hero', label: 'Hero image', type: 'image', size: 'hero' }, { name: 'body', label: 'Page content', type: 'markdown' }] },
    dynamicCollections: { projects: { label: 'Project', titleField: 'title', orderField: 'order', fields: [{ name: 'title', label: 'Title', type: 'string', required: true }, { name: 'order', label: 'Order', type: 'number' }] } },
  });
  if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
});

test.afterAll(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => setTimeout(resolve, 50));
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(remote, { recursive: true, force: true });
});

test('edit, upload, reorder, publish and restore through V2', async ({ page }) => {
  const browserErrors = [];
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Ascend Site Admin 2.0')).toBeVisible();
  await page.getByRole('button', { name: 'Home page' }).click();
  await page.getByLabel('Page title').fill('Updated home');

  const embeddedPhoto = `data:image/png;base64,${fs.readFileSync(photoPath).toString('base64')}`;
  await page.getByRole('button', { name: 'Paste ChatGPT HTML' }).click();
  await page.getByLabel('ChatGPT HTML').fill(`<html><head><style>.creative { color: teal; }</style></head><body><section class="creative" style="display:grid"><h2>Creative content</h2><img src="${embeddedPhoto}" alt="Green test image"><button onclick="this.textContent='Done'">Try it</button><script>document.body.dataset.imported='yes';</script></section></body></html>`);
  await page.getByRole('button', { name: 'Sort into page' }).click();
  await expect(page.getByText('Content sorted successfully')).toBeVisible();
  await expect(page.getByText(/embedded images saved as files/)).toBeVisible();
  await expect(page.getByText(/style blocks moved to page CSS/)).toBeVisible();
  await expect(page.getByText(/scripts moved to page JavaScript/)).toBeVisible();
  await page.getByRole('button', { name: 'Review page content' }).click();

  await page.getByRole('button', { name: 'Add a photo' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload new photo' }).click();
  await (await chooser).setFiles(photoPath);
  await page.getByLabel(/Image description/).fill('Green test image');
  await page.getByRole('button', { name: 'Save draft' }).first().click();
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
  expect(fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf8')).toContain('Updated home');
  expect(fs.readFileSync(path.join(root, 'src/content/pages/home.md'), 'utf8')).toContain('Creative content');
  expect(fs.readdirSync(path.join(root, 'public/content-assets/pages/home')).some(file => file.endsWith('.css'))).toBe(true);
  expect(fs.readdirSync(path.join(root, 'public/content-assets/pages/home')).some(file => file.endsWith('.js'))).toBe(true);

  await page.getByRole('button', { name: 'Reorder Alpha' }).dragTo(page.getByRole('button', { name: 'Reorder Beta' }));
  await expect(page.getByText('Entry order saved as a draft.')).toBeVisible();
  expect(fs.readFileSync(path.join(root, 'src/content/projects/beta.md'), 'utf8')).toMatch(/order: 1/);

  await page.getByRole('button', { name: 'Publish' }).first().click();
  await expect(page.getByText(/Published successfully/)).toBeVisible();

  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await page.getByRole('button', { name: 'Restore version' }).click();
  await expect(page.getByText(/Previous version restored as a draft/)).toBeVisible();
  await expect(page.getByLabel('Page title')).toHaveValue('Home');
  expect(browserErrors).toEqual([]);
});

test('responsive navigation and keyboard save remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('complementary', { name: 'Content navigation' })).toHaveClass(/is-open/);
  await page.getByRole('button', { name: 'Home page' }).click();
  await page.getByLabel('Page title').fill('Keyboard update');
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
});
