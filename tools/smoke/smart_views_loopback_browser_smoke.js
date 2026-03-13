const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
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
      { id: 'romance-delta', title: 'Romance Delta', url: 'https://romance.example.com/series/9', workspace: 'main', category: 'Reading', tags: ['Romance'], lastVisited: now - (4 * 24 * 60 * 60 * 1000), updatedAt: now - (2 * 24 * 60 * 60 * 1000), createdAt: now - (300 * 24 * 60 * 60 * 1000) }
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
          { id: 'entry-alpha', title: 'Entry Alpha', genre: 'Action, Adventure', language: 'English', libraryStatus: { id: 'reading', label: 'Reading' }, rating: 4.5, apiRatings: { anilist: 8.6 }, chapter: 48, publicationYear: 2022 },
          { id: 'entry-beta', title: 'Entry Beta', genre: 'Action, Drama', language: 'ja', libraryStatus: { id: 'completed', label: 'Completed' }, rating: 3.5, apiRatings: { anilist: 7.1 }, chapter: 128, publicationYear: 2018 },
          { id: 'entry-gamma', title: 'Entry Gamma', genre: 'Action', language: 'Korean', libraryStatus: { id: 'plan_to_read', label: 'Plan to Read' }, rating: 4.75, apiRatings: { anilist: 9.1 }, chapter: 512, publicationYear: 2009 },
          { id: 'entry-delta', title: 'Entry Delta', genre: 'Romance', language: 'English', libraryStatus: { id: 'on_hold', label: 'On Hold' }, rating: 3.25, apiRatings: { anilist: 6.8 }, chapter: 12, publicationYear: 2024 }
        ]
      }
    },
    connections: [
      { id: 'conn-alpha', linkId: 'action-alpha', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-alpha' },
      { id: 'conn-beta', linkId: 'action-beta', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-beta' },
      { id: 'conn-gamma', linkId: 'action-gamma', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-gamma' },
      { id: 'conn-delta', linkId: 'romance-delta', workspace: 'main', categoryName: 'OtherCategory', libraryEntryId: 'entry-delta' }
    ]
  };
}

async function runSmoke(page) {
  return await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const categoryName = 'Reading';
    const workspaceId = 'main';

    function getCard() {
      return document.querySelector(`.category-card[data-card-category="${categoryName}"][data-card-workspace="${workspaceId}"]`);
    }

    function currentTileTitles() {
      const card = getCard();
      if (!card) return [];
      return Array.from(card.querySelectorAll('.folder-tile'))
        .filter((tile) => tile.getClientRects().length > 0)
        .map((tile) => (tile.querySelector('.folder-tile-title')?.textContent || '').trim())
        .filter(Boolean);
    }

    async function waitForFolderTile(title, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const card = getCard();
        if (card) {
          const found = Array.from(card.querySelectorAll('.folder-tile')).find((el) => {
            if (el.getClientRects().length === 0) return false;
            return (el.querySelector('.folder-tile-title')?.textContent || '').trim() === title;
          });
          if (found) return found;
        }
        await wait(100);
      }
      throw new Error(`Folder tile not found: ${title} :: ${currentTileTitles().join(' | ')}`);
    }

    async function clickTile(title) {
      const tile = await waitForFolderTile(title);
      tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await wait(250);
    }

    await waitForFolderTile('[ System Views ]');
    await clickTile('[ System Views ]');
    await clickTile('[ Smart Indexes ]');
    const rootIndexTiles = currentTileTitles();
    if (!rootIndexTiles.includes('[ By Status ]')) {
      throw new Error(`Root smart indexes missing [ By Status ] :: ${rootIndexTiles.join(' | ')}`);
    }

    window.EveFolderViewV2.exitFolder(null, categoryName, workspaceId);
    await wait(150);
    await clickTile('H18');
    await clickTile('[ System Views ]');
    await clickTile('[ Insights ]');
    await clickTile('[ Large Folders (>15) ]');
    const h18LargeFolderTiles = currentTileTitles();
    ['[ By Tags ]', '[ By Rating ]', '[ Maintenance ]', '[ Activity ]', '[ Insights ]'].forEach((label) => {
      if (!h18LargeFolderTiles.includes(label)) {
        throw new Error(`H18 large-folder loop missing ${label} :: ${h18LargeFolderTiles.join(' | ')}`);
      }
    });

    window.EveFolderViewV2.exitFolder(null, categoryName, workspaceId);
    await wait(150);
    await clickTile('[ System Views ]');
    await clickTile('[ Smart Indexes ]');
    await clickTile('[ By Status ]');
    await clickTile('[ Reading ]');
    const readingTiles = currentTileTitles();
    ['[ Maintenance ]', '[ Activity ]', '[ Insights ]'].forEach((label) => {
      if (!readingTiles.includes(label)) {
        throw new Error(`Reading loop missing ${label} :: ${readingTiles.join(' | ')}`);
      }
    });

    return {
      rootIndexTiles,
      h18LargeFolderTiles,
      readingTiles
    };
  });
}

async function main() {
  const port = await getFreePort();
  const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-smart-views-loopback-'));
  let browser = null;
  const server = spawn('python', ['python-server.py', String(port), '--no-browser', '--modular-root', modularRoot], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverStdout = '';
  let serverStderr = '';
  server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
  server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

  try {
    await waitForStatus(`http://localhost:${port}/api/status`);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const seed = buildSeedPayload();

    await page.addInitScript((payload) => {
      localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
      localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
      localStorage.setItem('eveLibraryData', JSON.stringify(payload.libraries));
      localStorage.setItem('eveLibraryConnections', JSON.stringify(payload.connections));
    }, seed);

    await page.goto(`http://localhost:${port}/EveOS.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => (
      !!window.EveBookmarkFolders &&
      !!window.EveFolderViewV2 &&
      !!document.querySelector('.category-card[data-card-category="Reading"][data-card-workspace="main"]')
    ), undefined, { timeout: 180000 });
    await page.waitForTimeout(2500);

    const result = await runSmoke(page);
    console.log(`SMART_VIEWS_LOOPBACK_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
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
