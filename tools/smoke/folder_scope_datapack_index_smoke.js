const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'alpha-root-1', title: 'Alpha Root', url: 'https://example.com/alpha-root', workspace: 'main', category: 'Alpha', done: false },
      { id: 'alpha-folder-1', title: 'Folder One', url: 'https://example.com/folder-one', workspace: 'main', category: 'Alpha', folderId: 'folder-a', done: false }
    ],
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'folder-a', name: 'Folder A', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      showInactiveTabs: true,
      cardFolderViewModes: {
        'main::Alpha': false
      },
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder', subTabs: [] }
      ],
      categoryOrder: ['Alpha'],
      hideStats: []
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && !!window.EveOS?.DatapackIndex
    && !!window.EveFolderViewV2?.getFolderScopedLinkIds
    && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt
  ), undefined, { timeout: 120000 });
  await page.waitForTimeout(250);
}

async function seedState(page, seed) {
  await page.evaluate(async (payload) => {
    config = JSON.parse(JSON.stringify(payload.config));
    links = JSON.parse(JSON.stringify(payload.links));
    window.config = config;
    window.links = links;
    if (window.eveState) {
      window.eveState.config = config;
      window.eveState.links = links;
    }

    const folderStoreApi = window.EveBookmarkFolders?._shared || null;
    if (folderStoreApi?.setScopedTree) {
      Object.keys(payload.bookmarkFolders || {}).forEach((scopedKey) => {
        const parts = String(scopedKey || '').split('::');
        const workspaceId = String(parts[0] || 'main').trim() || 'main';
        const categoryName = String(parts.slice(1).join('::') || 'Unsorted').trim() || 'Unsorted';
        folderStoreApi.setScopedTree(workspaceId, categoryName, payload.bookmarkFolders[scopedKey], { persist: false });
      });
    } else {
      bookmarkFolders = JSON.parse(JSON.stringify(payload.bookmarkFolders));
      window.bookmarkFolders = bookmarkFolders;
      if (window.eveState) window.eveState.bookmarkFolders = bookmarkFolders;
    }

    try {
      localStorage.removeItem('eve.nexusIndex.v1');
      localStorage.removeItem('eve.nexusIndex.v2');
      localStorage.setItem('eveV22Data', JSON.stringify(links));
      localStorage.setItem('eveV22Config', JSON.stringify(config));
    } catch (error) {
      // file:// can reject localStorage writes
    }

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'folder-scope-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'folder-scope-seed' });
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function injectRawFolderDrift(page) {
  await page.evaluate(() => {
    const driftLink = {
      id: 'alpha-folder-drift',
      title: 'Folder Drift',
      url: 'https://example.com/folder-drift',
      workspace: 'main',
      category: 'Alpha',
      folderId: 'folder-a',
      done: false
    };
    const nextLinks = Array.isArray(window.links) ? window.links.slice() : [];
    nextLinks.push(driftLink);
    links = nextLinks;
    window.links = nextLinks;
    if (window.eveState) window.eveState.links = nextLinks;
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  });
}

async function runSmoke(page) {
  await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="main"]', { timeout: 15000 });

  const rootSnapshot = await page.evaluate(() => {
    const card = document.querySelector('.category-card[data-card-category="Alpha"][data-card-workspace="main"]');
    const folderTiles = Array.from(card?.querySelectorAll('.folder-tile') || []).map((tile) => ({
      title: String(tile.querySelector('.folder-tile-title')?.textContent || '').trim(),
      stats: String(tile.querySelector('.folder-tile-stats')?.textContent || '').trim()
    }));
    const renderedTitles = Array.from(card?.querySelectorAll('li a') || [])
      .map((node) => String(node.textContent || '').trim())
      .filter(Boolean);
    const folderTitles = Array.from(card?.querySelectorAll('.bookmark-folder-title') || [])
      .map((node) => String(node.textContent || '').trim())
      .filter(Boolean);
    const indexedIds = window.EveOS.DatapackIndex.getScopedBookmarkLinkIds({
      scope: 'folder',
      workspaceId: 'main',
      categoryName: 'Alpha',
      folderId: 'folder-a'
    });
    const folderScopedIds = window.EveFolderViewV2.getFolderScopedLinkIds('main', 'Alpha', 'folder-a');
    const realScope = window.EveFolderViewV2._shared?.getRealFolderScope
      ? window.EveFolderViewV2._shared.getRealFolderScope('main', 'Alpha', 'folder-a')
      : null;
    const scopedNodes = typeof window.EveBookmarkFolders?._shared?.getScopedNodes === 'function'
      ? window.EveBookmarkFolders._shared.getScopedNodes('main', 'Alpha')
      : [];
    const cachedViewModel = window.EveFolderViewV2.getCachedViewModel('main', 'Alpha');
    return {
      folderTiles,
      renderedTitles,
      folderTitles,
      indexedIds,
      folderScopedIds,
      realScopeLinkIds: Array.isArray(realScope?.links) ? realScope.links.map((link) => String(link?.id || '').trim()).filter(Boolean) : [],
      targetNodeName: String(realScope?.targetNode?.name || '').trim(),
      sourceLinkIds: Array.isArray(window.eveState?.links) ? window.eveState.links.map((link) => String(link?.id || '').trim()) : [],
      folderStoreKeys: Object.keys(window.eveState?.bookmarkFolders || {}),
      sharedNodeIds: Array.isArray(scopedNodes) ? scopedNodes.map((node) => String(node?.id || '').trim()) : [],
      cachedNodeIds: Array.isArray(cachedViewModel?.nodes) ? cachedViewModel.nodes.map((node) => String(node?.id || '').trim()) : []
    };
  });

  if (!rootSnapshot.folderTitles.includes('Folder A')) {
    throw new Error('Expected real folder title missing from dashboard card: ' + JSON.stringify(rootSnapshot));
  }
  if (!rootSnapshot.renderedTitles.includes('Alpha Root') || !rootSnapshot.renderedTitles.includes('Folder One')) {
    throw new Error('Expected indexed card bookmarks missing: ' + JSON.stringify(rootSnapshot));
  }
  if (rootSnapshot.renderedTitles.includes('Folder Drift')) {
    throw new Error('Raw drift bookmark leaked into dashboard card before reindex: ' + JSON.stringify(rootSnapshot));
  }
  if (JSON.stringify(rootSnapshot.indexedIds) !== JSON.stringify(['alpha-folder-1'])) {
    throw new Error('Datapack index returned unexpected folder IDs: ' + JSON.stringify(rootSnapshot.indexedIds));
  }
  if (JSON.stringify(rootSnapshot.folderScopedIds) !== JSON.stringify(['alpha-folder-1'])) {
    throw new Error('Folder scope returned unexpected live IDs: ' + JSON.stringify(rootSnapshot.folderScopedIds));
  }

  return {
    rootSnapshot
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
    await injectRawFolderDrift(page);
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
