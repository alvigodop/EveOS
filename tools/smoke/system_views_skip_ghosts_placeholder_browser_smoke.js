const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function buildSeedPayload() {
  const now = Date.now();
  return {
    links: [
      {
        id: 'sv-root-1',
        title: 'System Views Anchor',
        url: 'https://example.com/SystemViewsAnchor',
        workspace: 'main',
        category: 'Alpha',
        updatedAt: now
      },
      {
        id: 'sv-folder-1',
        title: 'Folder Scoped Anchor',
        url: 'https://example.com/FolderAnchor',
        workspace: 'main',
        category: 'Alpha',
        folderId: 'folder-a',
        updatedAt: now
      }
    ],
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'folder-a', parentId: null, name: 'Folder A', order: 0, createdAt: now, updatedAt: now },
          { id: 'folder-b', parentId: 'folder-a', name: 'Folder B', order: 1, createdAt: now, updatedAt: now }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: {
      activeWorkspace: 'main',
      workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
      cardFolderViewModes: { 'main::Alpha': true },
      activeManhwaFolders: {},
      activeManhwaScopeRoots: {}
    }
  };
}

async function main() {
  const port = await getFreePort();
  const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-system-views-store-'));
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
      !!window.EveBookmarkFolders?.buildFolderView
      && !!window.EveBookmarkFolders?._shared?.getScopedNodes
      && !!window.eveState?.config
    ), null, { timeout: 180000 });

    const result = await page.evaluate((seedPayload) => {
      window.eveState = window.eveState || {};
      window.eveState.config = Object.assign({}, seedPayload.config, window.eveState.config || {});
      window.eveState.links = seedPayload.links.slice();
      window.eveState.bookmarkFolders = JSON.parse(JSON.stringify(seedPayload.bookmarkFolders));
      window.links = window.eveState.links;
      window.bookmarkFolders = window.eveState.bookmarkFolders;
      try { bookmarkFolders = window.eveState.bookmarkFolders; } catch (error) {}

      const links = (window.eveState?.links || window.links || []).filter((link) => (
        String(link?.workspace || '') === 'main' && String(link?.category || '') === 'Alpha'
      ));
      const key = 'main::Alpha';
      window.eveState.config.activeManhwaFolders = window.eveState.config.activeManhwaFolders || {};
      window.eveState.config.activeManhwaScopeRoots = window.eveState.config.activeManhwaScopeRoots || {};

      function capture(activeFolderId, skipGhosts) {
        if (activeFolderId) {
          window.eveState.config.activeManhwaFolders[key] = activeFolderId;
          window.eveState.config.activeManhwaScopeRoots[key] = activeFolderId;
        } else {
          delete window.eveState.config.activeManhwaFolders[key];
          delete window.eveState.config.activeManhwaScopeRoots[key];
        }
        const view = window.EveBookmarkFolders.buildFolderView('main', 'Alpha', links, { skipGhosts });
        const master = view.nodeMap.get('__ghost_master__') || null;
        return {
          skipGhosts,
          activeFolderId: activeFolderId || '',
          hasMaster: !!master,
          masterParentId: master ? String(master.parentId || '') : '',
          isPlaceholder: !!master?.isGhostPlaceholder,
          rootIds: (view.topLevelFolders || []).map((node) => node.id),
          activeChildIds: ((view.childrenMap.get(activeFolderId || null) || [])).map((node) => node.id),
          masterLinkCount: Array.isArray(view.folderLinks.get('__ghost_master__'))
            ? view.folderLinks.get('__ghost_master__').length
            : -1
        };
      }

      return {
        rootSkipped: capture('', true),
        nestedSkipped: capture('folder-a', true),
        rootFull: capture('', false)
      };
    }, seed);

    assert(result.rootSkipped.hasMaster, `Skipped root view lost System Views: ${JSON.stringify(result.rootSkipped)}`);
    assert(result.rootSkipped.isPlaceholder, `Skipped root System Views should be lightweight placeholder: ${JSON.stringify(result.rootSkipped)}`);
    assert(result.rootSkipped.rootIds.includes('__ghost_master__'), `Skipped root System Views not top-level: ${JSON.stringify(result.rootSkipped)}`);
    assert(result.nestedSkipped.hasMaster, `Skipped active-folder view lost System Views: ${JSON.stringify(result.nestedSkipped)}`);
    assert(result.nestedSkipped.isPlaceholder, `Skipped nested System Views should be lightweight placeholder: ${JSON.stringify(result.nestedSkipped)}`);
    assert(result.nestedSkipped.masterParentId === 'folder-a', `Nested System Views should attach inside active folder: ${JSON.stringify(result.nestedSkipped)}`);
    assert(result.nestedSkipped.activeChildIds.includes('__ghost_master__'), `Nested System Views missing from active folder children: ${JSON.stringify(result.nestedSkipped)}`);
    assert(result.rootFull.hasMaster, `Full ghost build lost System Views: ${JSON.stringify(result.rootFull)}`);
    assert(!result.rootFull.isPlaceholder, `Full ghost build should hydrate real System Views: ${JSON.stringify(result.rootFull)}`);

    console.log(`SYSTEM_VIEWS_SKIP_GHOSTS_PLACEHOLDER_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
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
