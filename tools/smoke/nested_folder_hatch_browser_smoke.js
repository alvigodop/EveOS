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
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function buildSeedPayload() {
  const now = Date.now();
  return {
    links: [
      { id: 'parent-link', title: 'Parent Cover', url: 'https://covers.example.com/ParentZ', workspace: 'main', category: 'Nested', folderId: 'folder-parent', coverImage: 'https://img.example.com/parent.jpg', updatedAt: now },
      { id: 'child-link', title: 'Child Cover', url: 'https://covers.example.com/ChildZ', workspace: 'main', category: 'Nested', folderId: 'folder-child', coverImage: 'https://img.example.com/child.jpg', updatedAt: now },
      { id: 'grand-link', title: 'Grand Cover', url: 'https://covers.example.com/GrandZ', workspace: 'main', category: 'Nested', folderId: 'folder-grand', coverImage: 'https://img.example.com/grand.jpg', updatedAt: now }
    ],
    bookmarkFolders: {
      'main::Nested': {
        nodes: [
          { id: 'folder-parent', parentId: null, name: 'Parent Hatch', order: 0, createdAt: now, updatedAt: now },
          { id: 'folder-child', parentId: 'folder-parent', name: 'Child Hatch', order: 1, createdAt: now, updatedAt: now },
          { id: 'folder-grand', parentId: 'folder-child', name: 'Grand Hatch', order: 2, createdAt: now, updatedAt: now }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: {
      activeWorkspace: 'main',
      workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
      cardFolderViewModes: { 'main::Nested': true }
    }
  };
}

async function getTileState(page, cardSelector, title) {
  return page.evaluate(({ cardSelector, title }) => {
    const card = document.querySelector(cardSelector);
    const tile = Array.from(card?.querySelectorAll('.folder-tile') || []).find((node) => (
      node.getClientRects().length > 0
      && (node.querySelector('.folder-tile-title')?.textContent || '').trim() === title
    ));
    if (!tile) return null;
    const inline = tile.querySelector(':scope > .hatch-subfolders-inline');
    const hatch = tile.querySelector(':scope > .folder-tile-hatch');
    const panel = tile.querySelector(':scope > .folder-tile-hatch-panel');
    return {
      collapsed: tile.classList.contains('hatch-collapsed'),
      hasToggle: !!tile.querySelector(':scope > .folder-tile-hatch-toggle'),
      inlineCount: tile.querySelectorAll(':scope > .hatch-subfolders-inline .hatch-subfolder-icon').length,
      inlineDisplay: inline ? getComputedStyle(inline).display : '',
      hatchDisplay: hatch ? getComputedStyle(hatch).display : '',
      panelExists: !!panel,
      panelPointerEvents: panel ? getComputedStyle(panel).pointerEvents : ''
    };
  }, { cardSelector, title });
}

async function clickTile(page, cardSelector, title) {
  await page.evaluate(({ cardSelector, title }) => {
    const card = document.querySelector(cardSelector);
    const tile = Array.from(card?.querySelectorAll('.folder-tile') || []).find((node) => (
      node.getClientRects().length > 0
      && (node.querySelector('.folder-tile-title')?.textContent || '').trim() === title
    ));
    if (!tile) throw new Error(`Folder tile not found: ${title}`);
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, { cardSelector, title });
}

async function main() {
  const port = await getFreePort();
  const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-hatch-store-'));
  const server = spawn('python', ['python-server.py', String(port), '--no-browser', '--modular-root', modularRoot], {
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
    const cardSelector = '.category-card[data-card-category="Nested"][data-card-workspace="main"]';
    await page.waitForFunction((selector) => (
      !!window.EveFolderViewV2
      && !!window.EveFolderHoverTooltip
      && !!document.querySelector(selector)
    ), cardSelector, { timeout: 180000 });
    await page.waitForTimeout(1500);

    const parentInitial = await getTileState(page, cardSelector, 'Parent Hatch');
    assert(parentInitial, 'Parent folder tile missing');
    assert(parentInitial.hasToggle, `Parent hatch toggle missing: ${JSON.stringify(parentInitial)}`);
    assert(parentInitial.collapsed, `Parent hatch should default collapsed: ${JSON.stringify(parentInitial)}`);
    assert(parentInitial.inlineDisplay === 'none', `Inline subfolders should be hidden while collapsed: ${JSON.stringify(parentInitial)}`);

    await page.evaluate(() => {
      const nativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (String(key || '').startsWith('eve_folder_hatch_collapsed_')) {
          const error = new Error('Simulated folder hatch storage quota');
          error.name = 'QuotaExceededError';
          throw error;
        }
        return nativeSetItem.call(this, key, value);
      };
    });

    await page.locator(`${cardSelector} .folder-tile[data-folder-id="folder-parent"] > .folder-tile-hatch-toggle`).click();
    await page.waitForFunction((selector) => {
      const tile = document.querySelector(`${selector} .folder-tile[data-folder-id="folder-parent"]`);
      return !!tile && !tile.classList.contains('hatch-collapsed');
    }, cardSelector, { timeout: 8000 });
    const parentExpanded = await getTileState(page, cardSelector, 'Parent Hatch');
    assert(parentExpanded.inlineCount === 1, `Parent inline child folder icon missing: ${JSON.stringify(parentExpanded)}`);
    assert(parentExpanded.inlineDisplay !== 'none', `Parent inline subfolders should show after toggle: ${JSON.stringify(parentExpanded)}`);

    await page.evaluate(() => {
      const link = window.eveState?.links?.find((item) => item?.id === 'parent-link');
      if (link) link.title = 'Parent Cover Updated';
      window.__eveDashboardRenderHint = { immediate: true, source: 'folder-hatch-card-update-smoke' };
      window.renderDashboard();
    });
    await page.waitForFunction((selector) => {
      const tile = document.querySelector(`${selector} .folder-tile[data-folder-id="folder-parent"]`);
      return !!tile && !tile.classList.contains('hatch-collapsed');
    }, cardSelector, { timeout: 8000 });
    const parentAfterCardUpdate = await getTileState(page, cardSelector, 'Parent Hatch');
    assert(parentAfterCardUpdate.inlineDisplay !== 'none', `Parent hatch state reset after card update: ${JSON.stringify(parentAfterCardUpdate)}`);

    await page.locator(`${cardSelector} .folder-tile[data-folder-id="folder-parent"] .hatch-subfolder-icon`).hover();
    await page.waitForSelector('.eve-folder-hover-card.is-visible.is-compact', { timeout: 5000 });
    const tooltip = await page.evaluate(() => {
      const el = document.querySelector('.eve-folder-hover-card.is-visible.is-compact');
      return {
        name: el?.querySelector('.eve-folder-hover-card__name')?.textContent?.trim() || '',
        opacity: el ? getComputedStyle(el).opacity : ''
      };
    });
    assert(tooltip.name === 'Child Hatch', `Compact hatch tooltip mismatch: ${JSON.stringify(tooltip)}`);

    await clickTile(page, cardSelector, 'Parent Hatch');
    await page.waitForFunction((selector) => {
      const card = document.querySelector(selector);
      return Array.from(card?.querySelectorAll('.folder-tile-title') || []).some((node) => (node.textContent || '').trim() === 'Child Hatch');
    }, cardSelector, { timeout: 8000 });
    const childInitial = await getTileState(page, cardSelector, 'Child Hatch');
    assert(childInitial, 'Nested child folder tile missing after entering parent');
    assert(childInitial.hasToggle, `Nested child hatch toggle missing: ${JSON.stringify(childInitial)}`);
    assert(childInitial.collapsed, `Nested child hatch should default collapsed: ${JSON.stringify(childInitial)}`);

    await page.locator(`${cardSelector} .folder-tile[data-folder-id="folder-child"] > .folder-tile-hatch-toggle`).click();
    await page.waitForFunction((selector) => {
      const tile = document.querySelector(`${selector} .folder-tile[data-folder-id="folder-child"]`);
      return !!tile && !tile.classList.contains('hatch-collapsed');
    }, cardSelector, { timeout: 8000 });
    const childExpanded = await getTileState(page, cardSelector, 'Child Hatch');
    assert(childExpanded.inlineCount === 1, `Nested child inline grandchild missing: ${JSON.stringify(childExpanded)}`);
    assert(childExpanded.inlineDisplay !== 'none', `Nested child inline should show after toggle: ${JSON.stringify(childExpanded)}`);

    await page.evaluate(() => {
      window.EveFolderViewV2.enterFolder(null, 'Nested', 'folder-parent', 'main');
    });
    await page.waitForFunction((selector) => {
      const tile = document.querySelector(`${selector} .folder-tile[data-folder-id="folder-child"]`);
      return !!tile && !tile.classList.contains('hatch-collapsed');
    }, cardSelector, { timeout: 8000 });
    const childAfterFolderUpdate = await getTileState(page, cardSelector, 'Child Hatch');
    assert(childAfterFolderUpdate.inlineDisplay !== 'none', `Nested hatch state reset after folder rerender: ${JSON.stringify(childAfterFolderUpdate)}`);

    const configState = await page.evaluate(() => window.eveState?.config?.folderHatchCollapsed || {});
    assert(configState['main::nested::folder-parent'] === false, `Parent hatch state was not retained in config: ${JSON.stringify(configState)}`);
    assert(configState['main::nested::folder-child'] === false, `Child hatch state was not retained in config: ${JSON.stringify(configState)}`);

    console.log(`NESTED_FOLDER_HATCH_BROWSER_SMOKE_OK ${JSON.stringify({ parentInitial, parentExpanded, parentAfterCardUpdate, childInitial, childExpanded, childAfterFolderUpdate })}`);
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
