const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  const links = [];
  for (let categoryIndex = 1; categoryIndex <= 8; categoryIndex += 1) {
    const categoryName = `Cat${categoryIndex}`;
    for (let linkIndex = 1; linkIndex <= 24; linkIndex += 1) {
      links.push({
        id: `main-${categoryName}-${linkIndex}`,
        title: `${categoryName} Link ${linkIndex}`,
        url: `https://example.com/${categoryName.toLowerCase()}/${linkIndex}`,
        workspace: 'main',
        category: categoryName,
        done: linkIndex % 5 === 0
      });
    }
  }

  links.push({
    id: 'alt-root',
    title: 'Alt Root',
    url: 'https://example.com/alt',
    workspace: 'alt',
    category: 'Alt',
    done: false
  });

  return {
    links,
    config: {
      activeWorkspace: 'alt',
      viewMode: 'grid',
      sidebarExpanded: true,
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder' },
        { id: 'alt', name: 'Alt', icon: 'folder' }
      ],
      categoryOrder: ['Cat1', 'Cat2', 'Cat3', 'Cat4', 'Cat5', 'Cat6', 'Cat7', 'Cat8', 'Alt']
    },
    bookmarkFolders: {}
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && typeof window.switchWorkspace === 'function'
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
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function primeIndexedScopeCounter(page) {
  await page.evaluate(async () => {
    window.EveOS = window.EveOS || {};
    let indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    if (!indexApi || typeof indexApi.getScopedBookmarkLinkIds !== 'function') {
      indexApi = {
        hasUsableSnapshot() {
          return true;
        },
        getBuildState() {
          return { dirty: false, builtAt: Date.now() };
        },
        getScopedBookmarkLinkIds(scope) {
          const workspaceIds = new Set(Array.isArray(scope?.workspaceIds) ? scope.workspaceIds.map((id) => String(id || '').trim()) : []);
          return (Array.isArray(window.links) ? window.links : [])
            .filter((link) => workspaceIds.has(String(link?.workspace || 'main').trim()))
            .map((link) => String(link?.id || '').trim())
            .filter(Boolean);
        },
        resolveBookmarkLink(linkId) {
          const normalizedId = String(linkId || '').trim();
          return (Array.isArray(window.links) ? window.links : []).find((link) => String(link?.id || '').trim() === normalizedId) || null;
        }
      };
      window.EveOS.DatapackIndex = indexApi;
    }
    if (typeof indexApi.rebuild === 'function') {
      await Promise.resolve(indexApi.rebuild({ reason: 'workspace-switch-progressive-smoke' }));
    }
    if (window.__workspaceSwitchScopedIdsCounterInstalled) return;
    window.__workspaceSwitchScopedIdsCounterInstalled = true;
    window.__workspaceSwitchScopedIdsCount = 0;
    window.__workspaceSwitchInvalidateCount = 0;
    const original = indexApi.getScopedBookmarkLinkIds.bind(indexApi);
    indexApi.getScopedBookmarkLinkIds = function wrappedGetScopedBookmarkLinkIds(...args) {
      window.__workspaceSwitchScopedIdsCount += 1;
      return original(...args);
    };
    if (typeof window.invalidateDashboardDeferredWork === 'function' && !window.__workspaceSwitchInvalidateWrapped) {
      window.__workspaceSwitchInvalidateWrapped = true;
      const originalInvalidate = window.invalidateDashboardDeferredWork.bind(window);
      window.invalidateDashboardDeferredWork = function wrappedInvalidateDashboardDeferredWork(...args) {
        window.__workspaceSwitchInvalidateCount += 1;
        return originalInvalidate(...args);
      };
    }
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    await primeIndexedScopeCounter(page);

    await page.waitForSelector('.category-card[data-card-category="Alt"]', { timeout: 10000 });

    await page.evaluate(() => {
      if (typeof window.switchWorkspace !== 'function') throw new Error('switchWorkspace unavailable');
      window.switchWorkspace('main');
    });

    await page.waitForFunction(() => {
      const deferredCards = document.querySelectorAll('.category-card[data-card-deferred="1"]');
      const visibleCards = document.querySelectorAll('.category-card');
      return window.config?.activeWorkspace === 'main'
        && visibleCards.length >= 5
        && deferredCards.length >= 1;
    }, undefined, { timeout: 10000 });

    await page.waitForFunction(() => {
      const hydratedCard = document.querySelector('.category-card[data-card-category="Cat1"]:not([data-card-deferred="1"])');
      return !!hydratedCard
        && !!hydratedCard.querySelector('.category-footer')
        && !!hydratedCard.querySelector('.card-header-icon-row, .focus-card-controls');
    }, undefined, { timeout: 10000 });

    const scopedIdsCount = await page.evaluate(() => Number(window.__workspaceSwitchScopedIdsCount || 0));
    if (scopedIdsCount < 1) {
      throw new Error(`Expected workspace switch to use scoped index ids, got ${scopedIdsCount}`);
    }
    const invalidateCount = await page.evaluate(() => Number(window.__workspaceSwitchInvalidateCount || 0));
    if (invalidateCount < 1) {
      throw new Error(`Expected workspace switch to invalidate old deferred dashboard work, got ${invalidateCount}`);
    }

    console.log('WORKSPACE_SWITCH_PROGRESSIVE_CARDS_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
