const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'root-1', title: 'Root Outside', url: 'https://example.com/root', workspace: 'main', category: 'Alpha' },
      { id: 'parent-1', title: 'Parent Inside', url: 'https://example.com/parent', workspace: 'main', category: 'Alpha', folderId: 'f-parent' },
      { id: 'child-1', title: 'Child Inside', url: 'https://example.com/child', workspace: 'main', category: 'Alpha', folderId: 'f-child' }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      sidebarExpanded: true,
      workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
      categoryOrder: ['Alpha'],
      cardFolderViewModes: { 'main::Alpha': true }
    },
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'f-parent', parentId: null, name: 'Parent', order: 0 },
          { id: 'f-child', parentId: 'f-parent', name: 'Child', order: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && !!window.EveFolderViewV2?.restoreActiveFolderState
  ), undefined, { timeout: 120000 });
}

async function seedState(page, payload) {
  await page.evaluate((seed) => {
    config = JSON.parse(JSON.stringify(seed.config));
    links = JSON.parse(JSON.stringify(seed.links));
    bookmarkFolders = JSON.parse(JSON.stringify(seed.bookmarkFolders || {}));
    window.config = config;
    window.links = links;
    window.bookmarkFolders = bookmarkFolders;
    if (window.eveState) {
      window.eveState.config = config;
      window.eveState.links = links;
      window.eveState.bookmarkFolders = bookmarkFolders;
    }
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, payload);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());

    await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="main"]', { timeout: 10000 });

    await page.evaluate(() => {
      window.__folderAutoRestoreScrollTop = 900;
      window.__folderAutoRestoreScrollCalls = [];

      window.scrollTo = function (x, y) {
        window.__folderAutoRestoreScrollCalls.push({ x: Number(x) || 0, y: Number(y) || 0 });
        window.__folderAutoRestoreScrollTop = Number(y) || 0;
      };

      Object.defineProperty(window, 'pageYOffset', {
        configurable: true,
        get() {
          return Number(window.__folderAutoRestoreScrollTop || 0);
        }
      });
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        get() {
          return Number(window.__folderAutoRestoreScrollTop || 0);
        }
      });
      Object.defineProperty(document.documentElement, 'scrollTop', {
        configurable: true,
        get() {
          return Number(window.__folderAutoRestoreScrollTop || 0);
        }
      });

      window.scheduleDashboardMasonryLayout = function () {
        window.__folderAutoRestoreScrollTop = 240;
      };

      if (!window.eveState.config.activeManhwaFolders) window.eveState.config.activeManhwaFolders = {};
      window.eveState.config.activeManhwaFolders['main::Alpha'] = 'f-parent';
      window.EveFolderViewV2.restoreActiveFolderState('main', 'Alpha');
    });

    await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="main"] .v2-folder-container', { timeout: 10000 });
    await page.waitForTimeout(120);

    const result = await page.evaluate(() => ({
      scrollCalls: Array.isArray(window.__folderAutoRestoreScrollCalls) ? window.__folderAutoRestoreScrollCalls.slice() : [],
      scrollTop: Number(window.__folderAutoRestoreScrollTop || 0),
      hasFolderView: !!document.querySelector('.category-card[data-card-category="Alpha"][data-card-workspace="main"] .v2-folder-container')
    }));

    if (!result.hasFolderView) {
      throw new Error('Expected active folder auto-restore to render folder view');
    }
    if (result.scrollCalls.length > 0) {
      throw new Error(`Expected auto folder restore to avoid scrollTo, got ${JSON.stringify(result.scrollCalls)}`);
    }
    if (Math.abs(result.scrollTop - 240) > 10) {
      throw new Error(`Expected simulated scroll position to remain near 240 after auto restore, got ${result.scrollTop}`);
    }

    console.log('FOLDER_VIEW_AUTO_RESTORE_SCROLL_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
