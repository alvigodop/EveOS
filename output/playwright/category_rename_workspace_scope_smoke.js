const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'main-alpha-1', title: 'Main Alpha One', url: 'https://example.com/main-alpha-1', workspace: 'main', category: 'Alpha', done: false },
      { id: 'child-alpha-1', title: 'Child Alpha One', url: 'https://example.com/child-alpha-1', workspace: 'child', category: 'Alpha', done: false }
    ],
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'main-folder-a', name: 'Main Folder', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      },
      'child::Alpha': {
        nodes: [
          { id: 'child-folder-a', name: 'Child Folder', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      showInactiveTabs: true,
      workspaces: [
        {
          id: 'main',
          name: 'Main',
          icon: 'folder',
          subTabs: [
            { id: 'child', name: 'Child', icon: 'folder', hiddenInParent: false, subTabs: [] }
          ]
        }
      ],
      categoryOrder: ['Alpha'],
      categoryOrderByWorkspace: {
        main: ['Alpha'],
        child: ['Alpha']
      },
      hideStats: ['Alpha'],
      hideStatsScoped: []
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.switchWorkspace === 'function'
    && typeof window.confirmRename === 'function'
    && !!window.EveBookmarkFolders?.renameCategoryScope
    && !!window.EveCategoryOrder?.renameCategory
    && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt
  ), undefined, { timeout: 120000 });
  await page.waitForTimeout(250);
}

async function seedState(page, seed) {
  await page.evaluate(async (payload) => {
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

    const folderStoreApi = window.EveBookmarkFolders?._shared || null;
    if (folderStoreApi?.setScopedTree) {
      Object.keys(payload.bookmarkFolders || {}).forEach((scopedKey) => {
        const parts = String(scopedKey || '').split('::');
        const workspaceId = String(parts[0] || 'main').trim() || 'main';
        const categoryName = String(parts.slice(1).join('::') || 'Unsorted').trim() || 'Unsorted';
        folderStoreApi.setScopedTree(workspaceId, categoryName, payload.bookmarkFolders[scopedKey], { persist: false });
      });
    }

    try {
      localStorage.setItem('eveV22Data', JSON.stringify(links));
      localStorage.setItem('eveV22Config', JSON.stringify(config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(bookmarkFolders));
    } catch (error) {
      // file:// can reject localStorage writes
    }

    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function runSmoke(page) {
  await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="main"]', { timeout: 15000 });

  const snapshot = await page.evaluate(() => {
    window.showToast = function () {};
    window.ctxWsId = 'main';
    document.getElementById('oldCatName').value = 'Alpha';
    document.getElementById('renameInput').value = 'Beta';
    window.confirmRename();

    const linksState = Array.isArray(window.links)
      ? window.links.map((link) => ({
          id: String(link.id || '').trim(),
          workspace: String(link.workspace || '').trim(),
          category: String(link.category || '').trim()
        }))
      : [];
    const folderStore = window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
    const folderKeys = Object.keys(folderStore).sort();
    const orderStore = window.config?.categoryOrderByWorkspace || {};

    return {
      linksState,
      folderKeys,
      mainOrder: Array.isArray(orderStore.main) ? orderStore.main.slice() : [],
      childOrder: Array.isArray(orderStore.child) ? orderStore.child.slice() : [],
      hideStats: Array.isArray(window.config?.hideStats) ? window.config.hideStats.slice() : [],
      hideStatsScoped: Array.isArray(window.config?.hideStatsScoped) ? window.config.hideStatsScoped.slice().sort() : []
    };
  });

  if (JSON.stringify(snapshot.linksState) !== JSON.stringify([
    { id: 'main-alpha-1', workspace: 'main', category: 'Beta' },
    { id: 'child-alpha-1', workspace: 'child', category: 'Alpha' }
  ])) {
    throw new Error('Scoped category rename touched the wrong links: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.folderKeys) !== JSON.stringify(['child::Alpha', 'main::Beta'])) {
    throw new Error('Scoped category rename moved wrong folder trees: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.mainOrder) !== JSON.stringify(['Beta'])) {
    throw new Error('Scoped category rename did not update main category order correctly: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.childOrder) !== JSON.stringify(['Alpha'])) {
    throw new Error('Scoped category rename should preserve child category order: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.hideStats) !== JSON.stringify([])) {
    throw new Error('Legacy hideStats should migrate into scoped task-mode keys: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.hideStatsScoped) !== JSON.stringify(['child::Alpha', 'main::Beta'])) {
    throw new Error('Scoped task-mode store did not move with the renamed main category: ' + JSON.stringify(snapshot));
  }

  await page.evaluate(() => {
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  });
  await page.waitForSelector('.category-card[data-card-category="Beta"][data-card-workspace="main"]', { timeout: 15000 });

  const mainCardTitles = await page.evaluate(() => {
    const card = document.querySelector('.category-card[data-card-category="Beta"][data-card-workspace="main"]');
    return Array.from(card?.querySelectorAll('li a') || [])
      .map((node) => String(node.textContent || '').trim())
      .filter(Boolean);
  });

  await page.evaluate(() => {
    switchWorkspace('child', { forceRender: true });
  });
  await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="child"]', { timeout: 15000 });

  const childCardTitles = await page.evaluate(() => {
    const card = document.querySelector('.category-card[data-card-category="Alpha"][data-card-workspace="child"]');
    return Array.from(card?.querySelectorAll('li a') || [])
      .map((node) => String(node.textContent || '').trim())
      .filter(Boolean);
  });

  if (JSON.stringify(mainCardTitles) !== JSON.stringify(['Main Alpha One'])) {
    throw new Error('Main renamed card did not survive scoped rename: ' + JSON.stringify(mainCardTitles));
  }
  if (JSON.stringify(childCardTitles) !== JSON.stringify(['Child Alpha One'])) {
    throw new Error('Child Alpha card did not survive main-scoped rename: ' + JSON.stringify(childCardTitles));
  }

  return {
    snapshot,
    mainCardTitles,
    childCardTitles
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error && error.message ? error.message : error));
  });

  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    const smoke = await runSmoke(page);
    console.log(JSON.stringify({
      ok: true,
      smoke,
      consoleErrors,
      pageErrors
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: String(error && error.stack ? error.stack : error),
      consoleErrors,
      pageErrors
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
