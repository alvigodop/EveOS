const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOG_FILE = path.join(os.tmpdir(), 'eve-smart-views-browser-smoke.log');

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function logStep(message) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
}

async function waitForStatus(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function buildSeedPayload() {
  const now = Date.now();
  const h18Links = Array.from({ length: 16 }, (_, index) => ({
    id: `h18-${index}`,
    title: `Dense H18 ${index}`,
    url: `https://dense.example.com/h18/${index}`,
    workspace: 'main',
    category: 'Reading',
    folderId: 'folder-h18',
    tags: ['Overflow', index % 2 === 0 ? 'Dense' : 'Clustered'],
    rating: 6.8 + ((index % 4) * 0.5),
    lastVisited: now - ((index + 1) * 24 * 60 * 60 * 1000),
    updatedAt: now - ((index + 1) * 24 * 60 * 60 * 1000),
    createdAt: now - ((200 + index) * 24 * 60 * 60 * 1000)
  }));

  return {
    links: [
      { id: 'action-alpha', title: 'Action Alpha', url: 'https://alpha.example.com/series/1', workspace: 'main', category: 'Reading', tags: ['Action', 'Adventure'], lastVisited: now - (2 * 24 * 60 * 60 * 1000), updatedAt: now - (1 * 24 * 60 * 60 * 1000), createdAt: now - (400 * 24 * 60 * 60 * 1000) },
      { id: 'action-beta', title: 'Action Beta', url: 'https://alpha.example.com/series/2', workspace: 'main', category: 'Reading', tags: ['Action', 'Drama'], lastVisited: now - (20 * 24 * 60 * 60 * 1000), updatedAt: now - (18 * 24 * 60 * 60 * 1000), createdAt: now - (900 * 24 * 60 * 60 * 1000) },
      { id: 'action-gamma', title: 'Action Gamma', url: 'https://alpha.example.com/series/3', workspace: 'main', category: 'Reading', tags: ['Action'], lastVisited: now - (200 * 24 * 60 * 60 * 1000), updatedAt: now - (190 * 24 * 60 * 60 * 1000), createdAt: now - (1500 * 24 * 60 * 60 * 1000) },
      { id: 'romance-delta', title: 'Romance Delta', url: 'https://romance.example.com/series/9', workspace: 'main', category: 'Reading', tags: ['Romance'], lastVisited: now - (4 * 24 * 60 * 60 * 1000), updatedAt: now - (2 * 24 * 60 * 60 * 1000), createdAt: now - (300 * 24 * 60 * 60 * 1000) },
      { id: 'notes-tagged', title: 'Notes Tagged', url: 'https://notes.example.com/series/11', workspace: 'main', category: 'Reading', lastVisited: now - (8 * 24 * 60 * 60 * 1000), updatedAt: now - (6 * 24 * 60 * 60 * 1000), createdAt: now - (180 * 24 * 60 * 60 * 1000) },
      { id: 'manual-root', title: 'Manual Root', url: 'https://misc.example.com/root', workspace: 'main', category: 'Reading', lastVisited: now - (5 * 24 * 60 * 60 * 1000), updatedAt: now - (5 * 24 * 60 * 60 * 1000), createdAt: now - (120 * 24 * 60 * 60 * 1000) }
    ].concat(h18Links),
    bookmarkFolders: {
      'main::Reading': {
        nodes: [
          {
            id: 'folder-h18',
            parentId: null,
            name: 'H18',
            order: 0,
            createdAt: now - 1000,
            updatedAt: now - 1000,
            clickBehaviorMode: 'inherit',
            taskMode: 'inherit'
          }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: {
      activeWorkspace: 'main',
      workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
      cardFolderViewModes: { 'main::Reading': true }
    },
    libraries: {
      'main::OtherCategory': {
        dataType: 'graphicNovels',
        entries: [
          { id: 'entry-alpha', title: 'Entry Alpha', author: 'Writer One', authorAltNames: ['W. One'], genre: 'Action, Adventure', language: 'English', libraryStatus: { id: 'reading', label: 'Reading' }, rating: 4.5, apiRatings: { anilist: 8.6, myanimelist: 8.4, mangadex: 8.8 }, chapter: 48, demographic: 'Seinen', publicationYear: 2022 },
          { id: 'entry-beta', title: 'Entry Beta', author: 'Writer Two', genre: 'Action, Drama', language: 'ja', libraryStatus: { id: 'completed', label: 'Completed' }, rating: 3.5, apiRatings: { anilist: 7.1, myanimelist: 7.4, mangadex: 7.0 }, chapter: 128, demographic: 'Shonen', publicationYear: 2018 },
          { id: 'entry-gamma', title: 'Entry Gamma', author: 'Writer One', genre: 'Action', language: 'Korean', libraryStatus: { id: 'plan_to_read', label: 'Plan to Read' }, rating: 4.75, apiRatings: { anilist: 9.1, myanimelist: 9.3, mangadex: 9.0 }, chapter: 512, demographic: 'Seinen', publicationYear: 2009 },
          { id: 'entry-delta', title: 'Entry Delta', author: 'Writer Three', genre: 'Romance', language: 'English', libraryStatus: { id: 'on_hold', label: 'On Hold' }, rating: 3.25, apiRatings: { anilist: 6.8, myanimelist: 6.9, mangadex: 6.7 }, chapter: 12, demographic: 'Josei', publicationYear: 2024 },
          { id: 'entry-notes-tagged', title: 'Notes Tagged Entry', author: 'Writer Four', tags: ['Male Protagonist', 'Fantasy'], language: 'English', libraryStatus: { id: 'reading', label: 'Reading' }, rating: 4.1, apiRatings: { anilist: 8.0, myanimelist: 7.9, mangadex: 8.2 }, chapter: 34, publicationYear: 2021 }
        ]
      }
    },
    connections: [
      { id: 'conn-alpha', linkId: 'action-alpha', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-alpha' },
      { id: 'conn-beta', linkId: 'action-beta', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-beta' },
      { id: 'conn-gamma', linkId: 'action-gamma', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-gamma' },
      { id: 'conn-delta', linkId: 'romance-delta', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-delta' },
      { id: 'conn-notes-tagged', linkId: 'notes-tagged', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-notes-tagged' }
    ]
  };
}

async function runBrowserSmoke(page) {
  const categoryName = 'Reading';
  const cardSelector = `.category-card[data-card-category="${categoryName}"][data-card-workspace="main"]`;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function smokeLog(message) {
    logStep(String(message || ''));
  }

  async function currentTileTitles() {
    return page.locator(`${cardSelector} .folder-tile .folder-tile-title`).evaluateAll((nodes) => nodes
      .filter((node) => node.closest('.folder-tile')?.getClientRects().length > 0)
      .map((node) => (node.textContent || '').trim())
      .filter(Boolean));
  }

  async function currentGhostEditCount() {
    return page.locator(`${cardSelector} .folder-tile-ghost .folder-tile-edit-btn`).evaluateAll((nodes) => nodes
      .filter((node) => node.getClientRects().length > 0).length);
  }

  async function waitForFolderTile(title, timeoutMs = 5000) {
    await page.waitForFunction(({ cardSelector, title }) => {
      const card = document.querySelector(cardSelector);
      if (!card) return false;
      return Array.from(card.querySelectorAll('.folder-tile')).some((tile) => {
        if (tile.getClientRects().length === 0) return false;
        const text = (tile.querySelector('.folder-tile-title')?.textContent || '').trim();
        return text === title;
      });
    }, { cardSelector, title }, { timeout: timeoutMs });
  }

  async function clickFolderTile(title, timeoutMs = 5000) {
    await smokeLog(`click:start:${title}`);
    await waitForFolderTile(title, timeoutMs);
    await page.evaluate(({ cardSelector, title }) => {
      const card = document.querySelector(cardSelector);
      if (!card) throw new Error(`Card not found for ${cardSelector}`);
      const tile = Array.from(card.querySelectorAll('.folder-tile')).find((node) => {
        if (node.getClientRects().length === 0) return false;
        const text = (node.querySelector('.folder-tile-title')?.textContent || '').trim();
        return text === title;
      });
      if (!tile) throw new Error(`Folder tile not found: ${title}`);
      tile.scrollIntoView({ block: 'center', inline: 'center' });
      tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, { cardSelector, title });
    await wait(300);
    await smokeLog(`click:done:${title}`);
  }

  async function exitFolder() {
    await smokeLog('exit-folder:start');
    await page.evaluate(({ categoryName }) => {
      window.EveFolderViewV2.exitFolder(null, categoryName, 'main');
    }, { categoryName });
    await wait(150);
    await smokeLog('exit-folder:done');
  }

  async function resetRootView() {
    await smokeLog('reset-root:start');
    await page.evaluate(({ categoryName }) => {
      const key = `main::${categoryName}`;
      const cfg = window.eveState?.config;
      if (cfg?.activeManhwaFolders) delete cfg.activeManhwaFolders[key];
      if (cfg?.activeManhwaFolderChains) delete cfg.activeManhwaFolderChains[key];
      if (cfg?.activeManhwaScopeRoots) delete cfg.activeManhwaScopeRoots[key];
      if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }, { categoryName });
    await wait(300);
    await page.locator(cardSelector).waitFor({ state: 'visible', timeout: 10000 });
    await waitForFolderTile('[ System Views ]', 10000);
    await smokeLog('reset-root:done');
  }

  await page.locator(cardSelector).waitFor({ state: 'visible', timeout: 10000 });
  await smokeLog('card:reading:ready');

  await waitForFolderTile('[ System Views ]', 8000);
  await smokeLog('tile:system-views:ready');

  const topLevel = await currentTileTitles();
  if (!topLevel.includes('[ System Views ]')) {
    throw new Error(`System Views missing from top level: ${topLevel.join(' | ')}`);
  }

  await clickFolderTile('[ System Views ]');
  await clickFolderTile('[ Smart Indexes ]');
  await smokeLog('branch:smart-indexes');

  const indexTiles = await currentTileTitles();
  const expectedIndexes = [
    '[ By Tags ]',
    '[ By Genres ]',
    '[ By Authors ]',
    '[ By Language ]',
    '[ By Rating ]',
    '[ By Confidence ]',
    '[ By Title ]',
    '[ By Status ]',
    '[ By Last Read ]',
    '[ By Progress Units ]',
    '[ By Demographic ]',
    '[ By Publication Era ]'
  ];
  expectedIndexes.forEach((label) => {
    if (!indexTiles.includes(label)) {
      throw new Error(`Missing smart index tile: ${label} :: ${indexTiles.join(' | ')}`);
    }
  });

  if (await currentGhostEditCount() !== 0) {
    throw new Error('Ghost tiles should not expose edit buttons');
  }

  await resetRootView();
  await clickFolderTile('[ System Views ]');
  await clickFolderTile('[ Smart Indexes ]');
  await clickFolderTile('[ By Tags ]');
  await clickFolderTile('[ Action ]');
  await smokeLog('branch:by-tags:action');

  const actionTiles = await currentTileTitles();
  ['[ By Tags ]', '[ By Rating ]', '[ By Confidence ]', '[ Maintenance ]', '[ Activity ]', '[ Domains ]'].forEach((label) => {
    if (!actionTiles.includes(label)) {
      throw new Error(`Missing recursive action tile: ${label} :: ${actionTiles.join(' | ')}`);
    }
  });

  await clickFolderTile('[ Maintenance ]');
  await smokeLog('branch:action:maintenance');
  const maintenanceTiles = await currentTileTitles();
  if (!maintenanceTiles.includes('[ Missing Covers ]')) {
    throw new Error(`Missing maintenance branch inside action scope: ${maintenanceTiles.join(' | ')}`);
  }

  await resetRootView();
  await clickFolderTile('[ System Views ]');
  await clickFolderTile('[ Domains ]');
  await clickFolderTile('[ ALPHA.EXAMPLE.COM ]');
  await smokeLog('branch:domains:alpha');

  const domainTiles = await currentTileTitles();
  ['[ Maintenance ]', '[ Activity ]', '[ Insights ]', '[ By Tags ]', '[ By Rating ]'].forEach((label) => {
    if (!domainTiles.includes(label)) {
      throw new Error(`Missing recursive domain tile: ${label} :: ${domainTiles.join(' | ')}`);
    }
  });
  if (domainTiles.includes('[ Domains ]')) {
    throw new Error(`Domains should not immediately recurse inside a single-domain branch :: ${domainTiles.join(' | ')}`);
  }

  await resetRootView();
  await clickFolderTile('[ System Views ]');
  await clickFolderTile('[ Insights ]');
  await clickFolderTile('[ Large Folders (>15) ]');
  await smokeLog('branch:insights:large-folders:root');

  const largeFolderTiles = await currentTileTitles();
  ['[ By Tags ]', '[ By Rating ]', '[ Maintenance ]', '[ Activity ]', '[ Insights ]'].forEach((label) => {
    if (!largeFolderTiles.includes(label)) {
      throw new Error(`Missing recursive large-folders tile: ${label} :: ${largeFolderTiles.join(' | ')}`);
    }
  });

  await resetRootView();
  await clickFolderTile('H18');
  await clickFolderTile('[ System Views ]');
  await clickFolderTile('[ Insights ]');
  await clickFolderTile('[ Large Folders (>15) ]');
  await smokeLog('branch:insights:large-folders:nested');

  const nestedLargeFolderTiles = await currentTileTitles();
  ['[ By Tags ]', '[ By Rating ]', '[ Maintenance ]', '[ Activity ]', '[ Insights ]'].forEach((label) => {
    if (!nestedLargeFolderTiles.includes(label)) {
      throw new Error(`Missing nested recursive large-folders tile: ${label} :: ${nestedLargeFolderTiles.join(' | ')}`);
    }
  });

  await resetRootView();

  await smokeLog('ghost-toggle:publication-era:await-api');
  await page.waitForFunction(() => (
    typeof window.EveFolderViewV2?.isGhostFolderEnabled === 'function' &&
    typeof window.EveFolderViewV2?.toggleGhostFolder === 'function'
  ), undefined, { timeout: 120000 });
  await smokeLog('ghost-toggle:publication-era:api-ready');

  const publicationEraInitiallyEnabled = await page.evaluate(({ categoryName }) => (
    window.EveFolderViewV2.isGhostFolderEnabled('main', categoryName, 'publication_index')
  ), { categoryName });
  if (!publicationEraInitiallyEnabled) {
    throw new Error('Publication era ghost folder should start enabled for the smoke seed');
  }

  await smokeLog('ghost-toggle:publication-era:start');
  await page.evaluate(({ categoryName }) => {
    window.EveFolderViewV2.toggleGhostFolder('main', categoryName, 'publication_index');
  }, { categoryName });
  await page.waitForFunction(({ categoryName }) => (
    window.EveFolderViewV2.isGhostFolderEnabled('main', categoryName, 'publication_index') === false
  ), { categoryName }, { timeout: 10000 });
  await wait(500);
  await smokeLog('ghost-toggle:publication-era:done');

  await resetRootView();
  await clickFolderTile('[ System Views ]');
  await clickFolderTile('[ Smart Indexes ]');
  await smokeLog('branch:smart-indexes:post-toggle');

  const afterToggleTiles = await currentTileTitles();
  if (afterToggleTiles.includes('[ By Publication Era ]')) {
    throw new Error('Publication era index should disappear after toggle off');
  }

  return {
    topLevel,
    indexTiles,
    actionTiles,
    maintenanceTiles,
    domainTiles,
    largeFolderTiles,
    nestedLargeFolderTiles,
    afterToggleTiles
  };
}

async function main() {
  fs.writeFileSync(LOG_FILE, '');
  const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-smart-views-store-'));
  const port = await getFreePort();
  let browser = null;
  const server = spawn('python', ['server/python-server.py', String(port), '--no-browser', '--modular-root', modularRoot], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverStdout = '';
  let serverStderr = '';
  server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
  server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

  try {
    logStep('wait:start');
    await waitForStatus(`http://localhost:${port}/api/status`);
    logStep('wait:done');

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.exposeFunction('__smartViewsLog', (message) => logStep(String(message || '')));
    const seed = buildSeedPayload();

    await page.addInitScript((payload) => {
      localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
      localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
      localStorage.setItem('eveLibraryData', JSON.stringify(payload.libraries));
      localStorage.setItem('eveLibraryConnections', JSON.stringify(payload.connections));
    }, seed);

    await page.goto(`http://localhost:${port}/EveOS.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    logStep('goto:done');
    await page.waitForFunction(() => (
      !!window.EveBookmarkFolders &&
      !!window.EveFolderViewV2 &&
      !!window.openCategorySettings &&
      document.querySelector('.category-card')
    ), undefined, { timeout: 180000 });
    logStep('wait:core-ready');
    await page.waitForFunction(() => (
      !!document.querySelector('.category-card[data-card-category="Reading"][data-card-workspace="main"]')
    ), undefined, { timeout: 180000 });
    logStep('wait:reading-card-ready');
    await page.waitForTimeout(2500);
    logStep('wait:settle-done');

    const result = await runBrowserSmoke(page);
    logStep('run:done');
    console.log(`SMART_VIEWS_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    console.error('--- SERVER STDOUT ---');
    console.error(serverStdout);
    console.error('--- SERVER STDERR ---');
    console.error(serverStderr);
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) {}
    }
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!server.killed) server.kill('SIGKILL');
    fs.rmSync(modularRoot, { recursive: true, force: true });
  }
}

main();
