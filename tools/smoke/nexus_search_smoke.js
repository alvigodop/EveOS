const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'alpha-root', title: 'Alpha Test Bookmark', url: 'https://example.com/alpha', workspace: 'main', category: 'Alpha', done: false },
      { id: 'alpha-folder-link', title: 'Alpha Folder Bookmark', url: 'https://example.com/alpha-folder', workspace: 'main', category: 'Alpha', folderId: 'alpha-folder', done: false },
      { id: 'beta-root', title: 'Beta Debug Bookmark', url: 'https://example.com/beta', workspace: 'alt', category: 'Beta', done: false }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'unidex',
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
          { id: 'alpha-folder', parentId: null, name: 'Research', order: 0 }
        ]
      }
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && typeof window.openExpandedSearchModal === 'function'
    && typeof window.SearchMonitorBoot?.expand === 'function'
    && window.__eveCoreDataLoaded === true
    && window.__eveCoreDataLoading !== true
    && !!window.EveOS?.SearchAdvanced?.SearchVectors
    && !!window.EveOS?.SearchAdvanced?.Navigation
    && !!window.EveOS?.SearchAdvanced?.Locators
    && !!window.EveOS?.API?.SearchInternals?.saveScopedStorageValueAsync
    && !!window.EveOS?.API?.Cache?.storeQuery
  ), undefined, { timeout: 120000 });
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

    try {
      localStorage.setItem('eveV22Data', JSON.stringify(links));
      localStorage.setItem('eveV22Config', JSON.stringify(config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(bookmarkFolders));
    } catch (error) {
      // file:// can reject localStorage in some runs
    }

    await window.EveOS.API.SearchInternals.saveScopedStorageValueAsync('wikiEntries', [
      { title: 'Alpha Test Article', name: 'Alpha Test Article' }
    ], 'Alpha');
    await window.EveOS.API.SearchInternals.saveScopedStorageValueAsync('fandomDomains', [
      { domain: 'alpha-test.fandom.com', name: 'Alpha Test Wiki' }
    ], 'Alpha');
    await window.EveOS.API.Cache.storeQuery('Alpha Test', {
      mangadex: {
        data: [
          { id: 'md-alpha', attributes: { title: { en: 'Alpha Test' } } }
        ]
      }
    }, 'Alpha');

    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function runSmoke(page) {
  await page.evaluate(() => window.SearchMonitorBoot.expand());
  await page.waitForSelector('#loadingIndicator:not(.compact) .monitor-nexus-toggle', { timeout: 10000 });

  const launcherText = await page.locator('#loadingIndicator .monitor-nexus-toggle').textContent();
  if (String(launcherText || '').trim() !== 'Nexus') {
    throw new Error('Search Monitor Nexus launcher missing or mislabeled');
  }

  await page.locator('#loadingIndicator .monitor-nexus-toggle').click();
  await page.waitForFunction(() => {
    const modal = document.getElementById('expandedSearchModal');
    return !!modal && modal.style.display === 'flex';
  }, undefined, { timeout: 10000 });

  const vectorStates = await page.evaluate(() => ({
    google: document.querySelector('.nx-vector-slot[data-vector="google"]')?.classList.contains('nx-active') || false,
    knowledge: document.querySelector('.nx-vector-slot[data-vector="knowledge"]')?.classList.contains('nx-active') || false,
    cachedResults: document.querySelector('.nx-vector-slot[data-vector="cachedResults"]')?.classList.contains('nx-active') || false,
    bookmarks: document.querySelector('.nx-vector-slot[data-vector="bookmarks"]')?.classList.contains('nx-active') || false
  }));
  if (!vectorStates.knowledge) {
    throw new Error('Knowledge vector is not active by default');
  }

  await page.fill('#esQuery', 'Alpha');
  await page.locator('#esRunBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('#esResults .nx-group-title').length > 0, undefined, { timeout: 15000 });
  await page.evaluate(() => {
    document.querySelectorAll('#esResults .nx-result-group.collapsed [data-nx-collapse-group]').forEach((header) => header.click());
  });
  await page.waitForFunction(() => {
    return document.querySelectorAll('#esResults .nx-result-item').length >= 3;
  }, undefined, { timeout: 15000 });

  const summary = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('#esResults .nx-group-title')).map((node) => String(node.textContent || '').trim());
    const bookmarkItem = Array.from(document.querySelectorAll('#esResults .nx-result-item')).find((node) => {
      return String(node.textContent || '').includes('Alpha Folder Bookmark');
    });
    const monitor = document.getElementById('loadingIndicator');
    return {
      groups,
      hasBookmarkPathButton: !!bookmarkItem?.querySelector('[data-nx-action="path"]'),
      hasBookmarkUnidexButton: !!bookmarkItem?.querySelector('[data-nx-action="unidex"]'),
      hasBookmarkFocusButton: !!bookmarkItem?.querySelector('[data-nx-action="focus"]'),
      hasBookmarkProvenanceButton: !!bookmarkItem?.querySelector('[data-nx-action="provenance"]'),
      monitorLabels: {
        status: monitor?.querySelector('#searchStatusLabel')?.textContent || '',
        progress: monitor?.querySelector('#wikisSearchedLabel')?.textContent || '',
        results: monitor?.querySelector('#resultsFoundLabel')?.textContent || ''
      }
    };
  });

  if (!summary.groups.includes('Bookmarks')) throw new Error('Bookmark results group missing');
  if (!summary.groups.includes('Knowledge & Source Graph')) throw new Error('Knowledge results group missing');
  if (!summary.hasBookmarkPathButton || !summary.hasBookmarkUnidexButton || !summary.hasBookmarkFocusButton || !summary.hasBookmarkProvenanceButton) {
    throw new Error('Bookmark result actions are incomplete');
  }
  if (summary.monitorLabels.status !== 'Nexus:' || summary.monitorLabels.progress !== 'Vectors:' || summary.monitorLabels.results !== 'Results:') {
    throw new Error('Search Monitor labels were not updated for Nexus search: ' + JSON.stringify(summary.monitorLabels));
  }

  const folderResult = page.locator('#esResults .nx-result-item', { hasText: 'Alpha Folder Bookmark' }).first();
  const pathActionState = await folderResult.evaluate((item) => {
    const action = item.querySelector('[data-nx-action="path"]');
    const id = String(action?.getAttribute('data-nx-id') || '');
    const container = document.getElementById('esResults');
    const result = container?._nxResultMap?.get(id);
    return {
      id,
      mapped: !!result,
      type: result?.type || '',
      workspaceId: result?.workspaceId || '',
      categoryName: result?.categoryName || '',
      navigationReady: typeof window.EveOS?.SearchAdvanced?.Navigation?.goToPath === 'function'
    };
  });
  if (!pathActionState.mapped || !pathActionState.navigationReady) {
    throw new Error('Lazy Nexus result action was not wired: ' + JSON.stringify(pathActionState));
  }
  await folderResult.locator('[data-nx-action="path"]').click();
  try {
    await page.waitForFunction(() => {
      return window.config?.viewMode === 'grid'
        && window.config?.activeWorkspace === 'main'
        && typeof focusCategory !== 'undefined'
        && String(focusCategory || '').trim() === 'Alpha';
    }, undefined, { timeout: 10000 });
  } catch (error) {
    const currentState = await page.evaluate(() => ({
      viewMode: window.config?.viewMode || '',
      activeWorkspace: window.config?.activeWorkspace || '',
      focusCategory: typeof focusCategory === 'undefined' ? '' : String(focusCategory || '')
    }));
    throw new Error('Nexus path action timed out: ' + JSON.stringify({ pathActionState, currentState }));
  }

  await folderResult.locator('[data-nx-action="unidex"]').click();
  await page.waitForFunction(() => {
    const mainContent = document.getElementById('main-content');
    const grid = document.getElementById('dashboard-grid');
    return window.config?.viewMode === 'unidex'
      && !!mainContent?.classList.contains('unidex-view-active')
      && !!grid?.classList.contains('unidex-mode');
  }, undefined, { timeout: 10000 });

  await page.evaluate(() => closeModals());
  await page.waitForFunction(() => {
    const modal = document.getElementById('expandedSearchModal');
    return !!modal && modal.style.display === 'none';
  }, undefined, { timeout: 10000 });
  await page.keyboard.press('Control+Shift+K');
  await page.waitForFunction(() => {
    const modal = document.getElementById('expandedSearchModal');
    return !!modal && modal.style.display === 'flex';
  }, undefined, { timeout: 10000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
  const screenshotPath = path.join(REPO_ROOT, 'output', 'playwright', 'nexus_search_smoke.png');

  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    await runSmoke(page);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({
      ok: true,
      screenshotPath
    }, null, 2));
  } finally {
    await browser.close();
  }
})();
