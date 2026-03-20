const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'main-root', title: 'Main Root', url: 'https://example.com/main-root', workspace: 'main', category: 'Alpha', done: false },
      { id: 'main-folder-a', title: 'Main Folder A', url: 'https://example.com/main-folder-a', workspace: 'main', category: 'Alpha', folderId: 'f-main-a', done: false },
      { id: 'main-folder-b', title: 'Main Folder B', url: 'https://example.com/main-folder-b', workspace: 'main', category: 'Alpha', folderId: 'f-main-b', done: false },
      { id: 'alt-root', title: 'Alt Root', url: 'https://example.com/alt-root', workspace: 'alt', category: 'Beta', done: false }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder' },
        { id: 'alt', name: 'Alt', icon: 'folder' }
      ],
      categoryOrder: ['Alpha', 'Beta'],
      cardFolderViewModes: { 'main::Alpha': true }
    },
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'f-main-a', parentId: null, name: 'Main A', order: 0 },
          { id: 'f-main-b', parentId: 'f-main-a', name: 'Main B', order: 1 }
        ]
      }
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && typeof window.switchWorkspace === 'function'
    && typeof window.setFocus === 'function'
    && typeof window.toggleBookmarkFolderToolbar === 'function'
    && !!window.EveBookmarkFolders?.isToolbarExpanded
  ), undefined, { timeout: 120000 });
}

async function seedState(page, seed) {
  await page.evaluate((payload) => {
    config = JSON.parse(JSON.stringify(payload.config));
    links = JSON.parse(JSON.stringify(payload.links));
    bookmarkFolders = JSON.parse(JSON.stringify(payload.bookmarkFolders || {}));
    window.config = config;
    window.links = links;
    window.bookmarkFolders = bookmarkFolders;
    if (window.eveState) {
      window.eveState.config = config;
      window.eveState.links = links;
      window.eveState.bookmarkFolders = bookmarkFolders;
    }
    try {
      localStorage.setItem('eveV22Data', JSON.stringify(links));
      localStorage.setItem('eveV22Config', JSON.stringify(config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(bookmarkFolders));
    } catch (error) {
      // file:// can reject localStorage in some runs
    }
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function installRenderCounter(page) {
  await page.evaluate(() => {
    if (window.__workspaceSwitchRenderCounterInstalled) return;
    window.__workspaceSwitchRenderCounterInstalled = true;
    window.__workspaceSwitchRenderCount = 0;
    const original = window.renderDashboard;
    window.renderDashboard = function wrappedRenderDashboard(...args) {
      window.__workspaceSwitchRenderCount += 1;
      return original.apply(this, args);
    };
  });
}

async function resetRenderCounter(page) {
  await page.evaluate(() => {
    window.__workspaceSwitchRenderCount = 0;
  });
}

async function getRenderCounter(page) {
  return page.evaluate(() => Number(window.__workspaceSwitchRenderCount || 0));
}

async function runSmoke(page) {
  await installRenderCounter(page);

  await page.waitForSelector('.category-card[data-card-category="Alpha"]', { timeout: 10000 });

  await page.evaluate(() => {
    if (!window.EveQuickPins?.toggleBookmarkPin) throw new Error('Quick pins API unavailable');
    window.EveQuickPins.toggleBookmarkPin('main-root', { scopeType: 'tab' });
  });
  await page.waitForFunction(() => {
    return (window.EveQuickPins?.getPins?.().length || 0) === 1
      && (document.querySelectorAll('#dock-container .dock-item').length || 0) === 1;
  }, undefined, { timeout: 5000 });
  await page.locator('#dock-container .dock-item').hover();
  await page.locator('#dock-container .dock-control--remove').click();
  await page.waitForFunction(() => {
    return (window.EveQuickPins?.getPins?.().length || 0) === 0
      && (document.querySelectorAll('#dock-container .dock-item').length || 0) === 0;
  }, undefined, { timeout: 5000 });

  await page.locator('.ws-unidex').click();
  await page.waitForFunction(() => window.eveState?.config?.viewMode === 'unidex', undefined, { timeout: 5000 });

  await resetRenderCounter(page);
  await page.locator('#sidebar .ws-item').nth(1).click();
  await page.waitForFunction(() => {
    const mainContent = document.getElementById('main-content');
    const grid = document.getElementById('dashboard-grid');
    return window.eveState?.config?.viewMode === 'grid'
      && !!mainContent
      && !mainContent.classList.contains('unidex-view-active')
      && !!grid
      && !grid.classList.contains('unidex-mode');
  }, undefined, { timeout: 5000 });
  const unidexExitRenderCount = await getRenderCounter(page);
  if (unidexExitRenderCount !== 1) {
    throw new Error(`Expected one dashboard render when exiting Unidex into the active workspace, got ${unidexExitRenderCount}`);
  }

  await page.evaluate(() => window.setFocus('Alpha'));
  await page.waitForFunction(() => (
    typeof focusCategory !== 'undefined' && String(focusCategory || '').trim() === 'Alpha'
  ), undefined, { timeout: 5000 });

  await resetRenderCounter(page);
  await page.evaluate(() => window.switchWorkspace('alt'));
  await page.waitForSelector('.category-card[data-card-category="Beta"]', { timeout: 10000 });
  const altSwitchRenderCount = await getRenderCounter(page);
  if (altSwitchRenderCount !== 1) {
    throw new Error(`Expected one dashboard render when switching workspaces with focus active, got ${altSwitchRenderCount}`);
  }

  const focusCleared = await page.evaluate(() => (
    typeof focusCategory !== 'undefined' ? String(focusCategory || '').trim() : ''
  ));
  if (focusCleared) {
    throw new Error(`Expected workspace switch to clear focus before rendering, got ${focusCleared}`);
  }

  await resetRenderCounter(page);
  await page.evaluate(() => window.switchWorkspace('main'));
  await page.waitForSelector('.category-card[data-card-category="Alpha"]', { timeout: 10000 });
  const mainSwitchRenderCount = await getRenderCounter(page);
  if (mainSwitchRenderCount !== 1) {
    throw new Error(`Expected one dashboard render when switching back to main, got ${mainSwitchRenderCount}`);
  }

  await resetRenderCounter(page);
  await page.evaluate(() => window.switchWorkspace('main'));
  const noopRenderCount = await getRenderCounter(page);
  if (noopRenderCount !== 0) {
    throw new Error(`Expected same-workspace switch to no-op, got ${noopRenderCount} renders`);
  }

  const folderToggle = page.locator('.category-card[data-card-category="Alpha"] [data-folder-toolbar-toggle="1"]').first();
  await folderToggle.click();
  await page.waitForFunction(() => {
    const button = document.querySelector('.category-card[data-card-category="Alpha"] [data-folder-toolbar-toggle="1"]');
    const toolbar = document.querySelector('.category-card[data-card-category="Alpha"] .bookmark-folder-toolbar');
    return !!button
      && button.classList.contains('is-active')
      && !!toolbar
      && toolbar.classList.contains('is-visible')
      && !!window.EveBookmarkFolders?.isToolbarExpanded?.('main', 'Alpha');
  }, undefined, { timeout: 5000 });

  await folderToggle.click();
  await page.waitForFunction(() => {
    const button = document.querySelector('.category-card[data-card-category="Alpha"] [data-folder-toolbar-toggle="1"]');
    const toolbar = document.querySelector('.category-card[data-card-category="Alpha"] .bookmark-folder-toolbar');
    return !!button
      && !button.classList.contains('is-active')
      && !!toolbar
      && !toolbar.classList.contains('is-visible')
      && !window.EveBookmarkFolders?.isToolbarExpanded?.('main', 'Alpha');
  }, undefined, { timeout: 5000 });

  await page.evaluate(() => window.switchWorkspace('alt'));
  await page.waitForSelector('.category-card[data-card-category="Beta"]', { timeout: 10000 });
  await page.evaluate(() => window.switchWorkspace('main'));
  await page.waitForSelector('.category-card[data-card-category="Alpha"]', { timeout: 10000 });

  const folderToggleAfterSwitch = page.locator('.category-card[data-card-category="Alpha"] [data-folder-toolbar-toggle="1"]').first();
  await folderToggleAfterSwitch.click();
  await page.waitForFunction(() => {
    const button = document.querySelector('.category-card[data-card-category="Alpha"] [data-folder-toolbar-toggle="1"]');
    const toolbar = document.querySelector('.category-card[data-card-category="Alpha"] .bookmark-folder-toolbar');
    return !!button
      && button.classList.contains('is-active')
      && !!toolbar
      && toolbar.classList.contains('is-visible');
  }, undefined, { timeout: 5000 });

  await page.locator('.category-card[data-card-category="Alpha"] .bookmark-folder-toolbar-btn').first().click();
  await page.waitForFunction(() => {
    const modal = document.getElementById('bookmarkFolderCreatorModal');
    const input = document.getElementById('bookmarkFolderCreatorNameInput');
    return !!modal && modal.style.display === 'flex' && !!input;
  }, undefined, { timeout: 5000 });
  await page.fill('#bookmarkFolderCreatorNameInput', 'Created In Smoke');
  await page.evaluate(() => {
    if (!window.submitCategoryFolderCreate()) {
      throw new Error('submitCategoryFolderCreate returned false');
    }
  });
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('.category-card[data-card-category="Alpha"] .folder-tile-title'))
      .some((node) => String(node.textContent || '').trim() === 'Created In Smoke');
  }, undefined, { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    await runSmoke(page);
    console.log('WORKSPACE_SWITCH_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})();
