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
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
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
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function buildSeedPayload() {
  const now = Date.now();
  const links = [];
  function addBatch(workspace, category, count, offset, folderId) {
    for (let index = 0; index < count; index += 1) {
      const id = `${workspace}-${category}-${offset + index}`;
      links.push({
        id,
        title: `Smart Indexed Bookmark ${offset + index}`,
        url: `https://smart-index.example.com/${workspace}/${category}/ItemZ${offset + index}`,
        workspace,
        category,
        folderId: index % 3 === 0 ? folderId : '',
        identifiers: index % 2 === 0 ? ['reading'] : ['watching'],
        relatedUrls: index % 5 === 0 ? [{ url: `https://mirror.example.com/${id}`, label: 'Mirror' }] : [],
        coverImage: index % 4 === 0 ? `https://covers.example.com/${id}.jpg` : '',
        coverImages: index % 7 === 0 ? [`https://covers.example.com/${id}-alt.jpg`] : [],
        notes: index % 11 === 0 ? '=== Bookmark Merge ===\nMode: notes-only\nIncoming Title: Merge Candidate' : '',
        updatedAt: now - (index * 1000)
      });
    }
  }
  addBatch('main', 'Big', 3600, 0, 'folder-a');
  addBatch('child', 'Big', 1400, 4000, 'child-folder');
  addBatch('shortcut', 'Big', 400, 6000, 'shortcut-folder');

  return {
    links,
    bookmarkFolders: {
      'main::Big': { nodes: [{ id: 'folder-a', parentId: null, name: 'Folder A', order: 0, createdAt: now, updatedAt: now }], settings: {} },
      'child::Big': { nodes: [{ id: 'child-folder', parentId: null, name: 'Child Folder', order: 0, createdAt: now, updatedAt: now }], settings: {} },
      'shortcut::Big': { nodes: [{ id: 'shortcut-folder', parentId: null, name: 'Shortcut Folder', order: 0, createdAt: now, updatedAt: now }], settings: {} }
    },
    config: {
      activeWorkspace: 'main',
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder', subTabs: [{ id: 'child', name: 'Child', icon: 'folder', subTabs: [{ id: 'grand', name: 'Grand', icon: 'folder' }] }] },
        { id: 'shortcut', name: 'Shortcut', icon: 'link', linkedWorkspaceId: 'child' }
      ],
      sidebarGroups: [{ id: 'grp', name: 'Group', workspaceIds: ['main', 'shortcut'] }],
      cardFolderViewModes: { 'main::Big': true, 'child::Big': true, 'shortcut::Big': true },
      bookmarkIdentifiers: [
        { id: 'reading', label: 'Reading' },
        { id: 'watching', label: 'Watching' }
      ]
    }
  };
}

async function main() {
  const port = await getFreePort();
  const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-smart-views-5k-'));
  const server = spawn('python', ['server/python-server.py', String(port), '--no-browser', '--modular-root', modularRoot], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser = null;
  let serverStdout = '';
  let serverStderr = '';
  server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
  server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

  try {
    await waitForStatus(`http://localhost:${port}/api/status`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const seed = buildSeedPayload();
    await page.addInitScript((payload) => {
      localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
      localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
    }, seed);
    await page.goto(`http://localhost:${port}/EveOS.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => (
      !!window.EveSmartViewRegistry
      && !!window.EveBookmarkFolders
      && !!window.EveOS?.DatapackIndex
      && document.querySelector('.category-card')
    ), undefined, { timeout: 180000 });
    await page.waitForTimeout(1500);

    const result = await page.evaluate(async () => {
      const indexApi = window.EveOS.DatapackIndex;
      await indexApi.ensureFresh({ force: true, reason: 'smart-view-5k-smoke' });
      const links = window.getLiveLinks().filter((link) => link.workspace === 'main' && link.category === 'Big');
      const scopedNodes = window.EveBookmarkFolders?._shared?.getScopedNodes?.('main', 'Big') || [];
      const baseContext = {
        workspaceId: 'main',
        categoryName: 'Big',
        activeLinks: links,
        scopedNodes,
        getCachedEntry: () => null
      };
      const started = performance.now();
      const reading = window.EveSmartViewRegistry.evaluateViewFromIndex({ criteria: { identifiers: ['Reading'] } }, baseContext);
      const covers = window.EveSmartViewRegistry.evaluateViewFromIndex({ criteria: { hasCover: true } }, baseContext);
      const additionalCovers = window.EveSmartViewRegistry.evaluateViewFromIndex({ criteria: { hasAdditionalCovers: true } }, baseContext);
      const related = window.EveSmartViewRegistry.evaluateViewFromIndex({ criteria: { hasRelatedUrls: true } }, baseContext);
      const merge = window.EveSmartViewRegistry.evaluateViewFromIndex({ criteria: { mergeState: 'Merge History' } }, baseContext);
      const folder = window.EveSmartViewRegistry.evaluateViewFromIndex({ criteria: { identifiers: ['Reading'] } }, Object.assign({}, baseContext, { folderId: 'folder-a' }));
      const elapsedMs = performance.now() - started;
      const allTabs = indexApi.getScopedBookmarkLinkIds({ workspaceIds: ['main', 'child', 'shortcut'] });
      const childExact = indexApi.getExactBookmarkLinkIds({ workspaceId: 'child', categoryName: 'Big' });
      return {
        totalLinks: window.getLiveLinks().length,
        reading: reading?.length || 0,
        covers: covers?.length || 0,
        additionalCovers: additionalCovers?.length || 0,
        related: related?.length || 0,
        merge: merge?.length || 0,
        folder: folder?.length || 0,
        allTabs: allTabs.length,
        childExact: childExact.length,
        elapsedMs
      };
    });

    if (result.totalLinks < 5400) throw new Error(`Expected 5400+ bookmarks, saw ${JSON.stringify(result)}`);
    if (result.reading !== 1800) throw new Error(`Indexed card identifier count mismatch: ${JSON.stringify(result)}`);
    if (result.covers !== 1286) throw new Error(`Indexed card cover count mismatch: ${JSON.stringify(result)}`);
    if (result.additionalCovers !== 515) throw new Error(`Indexed card additional cover count mismatch: ${JSON.stringify(result)}`);
    if (result.related !== 720) throw new Error(`Indexed card related URL count mismatch: ${JSON.stringify(result)}`);
    if (result.merge !== 328) throw new Error(`Indexed card merge count mismatch: ${JSON.stringify(result)}`);
    if (result.folder !== 600) throw new Error(`Indexed folder count mismatch: ${JSON.stringify(result)}`);
    if (result.allTabs !== 5400) throw new Error(`All-tabs scoped count mismatch: ${JSON.stringify(result)}`);
    if (result.childExact !== 1400) throw new Error(`Child tab exact count mismatch: ${JSON.stringify(result)}`);
    if (result.elapsedMs > 2500) throw new Error(`Smart View indexed evaluation too slow: ${JSON.stringify(result)}`);

    console.log(`SMART_VIEWS_5K_INDEX_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
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
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!server.killed) server.kill('SIGKILL');
    fs.rmSync(modularRoot, { recursive: true, force: true });
  }
}

main();
