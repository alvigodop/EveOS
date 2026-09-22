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
      hideStats: []
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.switchWorkspace === 'function'
    && !!window.EveBookmarkFolders?.deleteCategoryScope
    && !!window.EveCategoryOrder?.removeCategory
    && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt
  ), undefined, { timeout: 120000 });
  await page.waitForTimeout(250);
}

async function waitForHydratedCardLinks(page, selector, expectedTitle, label) {
  await page.waitForSelector(selector, { timeout: 15000 });
  const card = page.locator(selector).first();
  const before = await card.evaluate((node) => ({
    deferred: node.getAttribute('data-card-deferred') === '1',
    onDemand: node.getAttribute('data-card-hydrate-on-demand') === '1',
    hydrating: node.getAttribute('data-card-hydrating') === '1'
  }));
  if (before.deferred && before.onDemand) {
    await card.hover();
  }

  try {
    await page.waitForFunction(({ selector, expectedTitle }) => {
      const node = document.querySelector(selector);
      if (!node || node.getAttribute('data-card-deferred') === '1') return false;
      const titles = Array.from(node.querySelectorAll('li a'))
        .map((anchor) => String(anchor.textContent || '').trim())
        .filter(Boolean);
      return titles.includes(expectedTitle);
    }, { selector, expectedTitle }, { timeout: 15000 });
  } catch (error) {
    const diagnostics = await page.evaluate(({ selector }) => {
      const node = document.querySelector(selector);
      const workspaceId = String(node?.getAttribute('data-card-workspace') || '').trim();
      const categoryName = String(node?.getAttribute('data-card-category') || '').trim();
      const liveLinks = typeof window.getLiveLinks === 'function'
        ? window.getLiveLinks()
        : (Array.isArray(window.links) ? window.links : []);
      return {
        activeWorkspace: String(window.config?.activeWorkspace || ''),
        cardExists: !!node,
        deferred: node?.getAttribute('data-card-deferred') === '1',
        onDemand: node?.getAttribute('data-card-hydrate-on-demand') === '1',
        hydrating: node?.getAttribute('data-card-hydrating') === '1',
        anchorTitles: Array.from(node?.querySelectorAll('li a') || [])
          .map((anchor) => String(anchor.textContent || '').trim())
          .filter(Boolean),
        scopedLinks: liveLinks
          .filter((link) => (
            String(link?.workspace || 'main').trim() === workspaceId
            && String(link?.category || 'Unsorted').trim() === categoryName
          ))
          .map((link) => ({
            id: String(link?.id || ''),
            title: String(link?.title || ''),
            workspace: String(link?.workspace || ''),
            category: String(link?.category || '')
          }))
      };
    }, { selector });
    throw new Error(label + ' did not hydrate expected bookmark: ' + JSON.stringify(diagnostics));
  }

  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return Array.from(node?.querySelectorAll('li a') || [])
      .map((anchor) => String(anchor.textContent || '').trim())
      .filter(Boolean);
  }, selector);
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

  const snapshot = await page.evaluate(async () => {
    window.showConfirm = async function () { return true; };
    window.showToast = function () {};
    window.ctxWsId = 'main';
    window.ctxCatName = 'Alpha';
    await window.deleteCategory('Alpha');

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
      childOrder: Array.isArray(orderStore.child) ? orderStore.child.slice() : []
    };
  });

  if (JSON.stringify(snapshot.linksState) !== JSON.stringify([
    { id: 'child-alpha-1', workspace: 'child', category: 'Alpha' }
  ])) {
    throw new Error('Scoped category deletion removed wrong links: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.folderKeys) !== JSON.stringify(['child::Alpha'])) {
    throw new Error('Scoped category deletion removed wrong folder trees: ' + JSON.stringify(snapshot));
  }
  if (snapshot.mainOrder.includes('Alpha')) {
    throw new Error('Scoped category deletion should remove Alpha from main category order: ' + JSON.stringify(snapshot));
  }
  if (!snapshot.childOrder.includes('Alpha')) {
    throw new Error('Scoped category deletion should preserve Alpha in child category order: ' + JSON.stringify(snapshot));
  }

  await page.evaluate(() => {
    switchWorkspace('child', { forceRender: true });
  });

  const childCardTitles = await waitForHydratedCardLinks(
    page,
    '.category-card[data-card-category="Alpha"][data-card-workspace="child"]',
    'Child Alpha One',
    'Child Alpha card after main-scoped delete'
  );

  if (JSON.stringify(childCardTitles) !== JSON.stringify(['Child Alpha One'])) {
    throw new Error('Child Alpha card did not survive main-scoped delete: ' + JSON.stringify(childCardTitles));
  }

  return {
    snapshot,
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
