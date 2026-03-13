const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'root-1', title: 'Root Outside', url: 'https://example.com/root', workspace: 'main', category: 'Alpha', tags: ['Root'] },
      { id: 'parent-1', title: 'Parent Inside', url: 'https://example.com/parent', workspace: 'main', category: 'Alpha', folderId: 'f-parent', tags: ['Action', 'Adventure'] },
      { id: 'child-1', title: 'Child Inside', url: 'https://example.com/child', workspace: 'main', category: 'Alpha', folderId: 'f-child', tags: ['Action', 'Mystery'] },
      { id: 'other-1', title: 'Other Folder Outside', url: 'https://example.com/other', workspace: 'main', category: 'Alpha', folderId: 'f-other' }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
      categoryOrder: ['Alpha'],
      cardFolderViewModes: { 'main::Alpha': true }
    },
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'f-parent', parentId: null, name: 'Parent', order: 0 },
          { id: 'f-child', parentId: 'f-parent', name: 'Child', order: 1 },
          { id: 'f-other', parentId: null, name: 'Other', order: 2 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    libraries: {},
    connections: []
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && !!window.EveFolderViewV2?.enterFolder
    && !!window.EveFolderViewV2?.openFolderScopedMap
    && !!window.openBulkTitleModal
    && !!window.openBulkLibraryAutoModal
    && !!window.EveConstellationMap?.openFolderMap
    && !!window.EveConstellationMap?.openDerivedMap
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
      window.eveState.links = links;
      window.eveState.config = config;
      window.eveState.bookmarkFolders = bookmarkFolders;
    }
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, payload);
}

async function runSmoke(page) {
  await page.evaluate(() => {
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.EveFolderViewV2.enterFolder(null, 'Alpha', 'f-parent', 'main');
  });

  await page.waitForSelector('.folder-breadcrumb-actions', { timeout: 10000 });

  const breadcrumbLayout = await page.evaluate(() => {
    const trail = document.querySelector('.folder-breadcrumb-trail');
    const actions = document.querySelector('.folder-breadcrumb-actions');
    if (!trail || !actions) {
      throw new Error('Missing folder breadcrumb layout nodes');
    }
    const trailRect = trail.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      gap: actionsRect.left - trailRect.right,
      actionsRight: actionsRect.right,
      viewportWidth: window.innerWidth
    };
  });
  if (breadcrumbLayout.gap > 80) {
    throw new Error(`Expected compact breadcrumb/action gap, got ${breadcrumbLayout.gap}`);
  }
  if (breadcrumbLayout.actionsRight > (breadcrumbLayout.viewportWidth - 12)) {
    throw new Error(`Breadcrumb actions overflowed the viewport: ${JSON.stringify(breadcrumbLayout)}`);
  }

  await page.evaluate(() => {
    window.EveFolderViewV2.enterFolder(null, 'Alpha', 'f-child', 'main');
  });
  await page.waitForSelector('.folder-breadcrumb-actions', { timeout: 10000 });
  const nestedBreadcrumbLayout = await page.evaluate(() => {
    const trail = document.querySelector('.folder-breadcrumb-trail');
    const actions = document.querySelector('.folder-breadcrumb-actions');
    if (!trail || !actions) {
      throw new Error('Missing nested folder breadcrumb layout nodes');
    }
    const trailRect = trail.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      gap: actionsRect.left - trailRect.right,
      actionsRight: actionsRect.right,
      viewportWidth: window.innerWidth,
      text: trail.textContent || ''
    };
  });
  if (nestedBreadcrumbLayout.gap > 80) {
    throw new Error(`Expected compact nested breadcrumb/action gap, got ${nestedBreadcrumbLayout.gap}`);
  }
  if (nestedBreadcrumbLayout.actionsRight > (nestedBreadcrumbLayout.viewportWidth - 12)) {
    throw new Error(`Nested breadcrumb actions overflowed the viewport: ${JSON.stringify(nestedBreadcrumbLayout)}`);
  }
  if (!/Parent/i.test(nestedBreadcrumbLayout.text) || !/Child/i.test(nestedBreadcrumbLayout.text)) {
    throw new Error(`Nested breadcrumb trail missing expected labels: ${JSON.stringify(nestedBreadcrumbLayout)}`);
  }

  await page.evaluate(() => {
    window.EveFolderViewV2.enterFolder(null, 'Alpha', 'f-parent', 'main');
  });
  await page.waitForSelector('.folder-breadcrumb-actions', { timeout: 10000 });

  const menuLabels = await page.evaluate(() => Array.from(document.querySelectorAll('.folder-breadcrumb-actions button')).map((node) => node.textContent.trim()));
  const iconCount = await page.locator('.folder-breadcrumb-actions .folder-breadcrumb-icon-btn').count();
  if (iconCount < 2) {
    throw new Error(`Expected pen and map icon buttons, got ${iconCount}`);
  }
  if (menuLabels.length !== 2) {
    throw new Error(`Expected only pen and map buttons in breadcrumb header, got ${menuLabels.join(' | ')}`);
  }

  await page.locator('.folder-breadcrumb-actions .folder-breadcrumb-icon-btn').first().click();
  await page.waitForSelector('.folder-breadcrumb-action-tray', { timeout: 5000 });
  const trayLabels = await page.evaluate(() => Array.from(document.querySelectorAll('.folder-breadcrumb-action-tray button')).map((node) => node.textContent.trim()));
  ['Edit Folder', 'Auto-Title', 'Auto-Library'].forEach((label) => {
    if (!trayLabels.some((value) => value.includes(label))) {
      throw new Error(`Missing folder tray action: ${label} :: ${trayLabels.join(' | ')}`);
    }
  });

  await page.evaluate(() => {
    const target = document.querySelector('.folder-tile-edit-btn');
    if (!target) throw new Error('Missing folder tile edit button');
    if (typeof window.showFolderContextMenu !== 'function') throw new Error('Missing showFolderContextMenu');
    const rect = target.getBoundingClientRect();
    window.showFolderContextMenu({
      preventDefault() {},
      stopPropagation() {},
      clientX: rect.left + 4,
      clientY: rect.top + 4
    }, 'Alpha', 'f-parent', 'main');
  });
  await page.waitForFunction(() => {
    const menu = document.getElementById('folder-context-menu');
    return !!menu && menu.style.display === 'block';
  }, undefined, { timeout: 5000 });
  const contextLabels = await page.evaluate(() => Array.from(document.querySelectorAll('#folder-context-menu .ctx-item')).map((node) => node.textContent.trim()));
  ['Constellation Map', 'Auto-Title Links', 'Auto-Add Library Entries'].forEach((label) => {
    if (!contextLabels.some((value) => value.includes(label))) {
      throw new Error(`Missing folder context action: ${label} :: ${contextLabels.join(' | ')}`);
    }
  });

  await page.evaluate(() => window.EveFolderViewV2.openFolderScopedMap('Alpha', 'f-parent', 'main'));
  await page.waitForFunction(() => {
    const overlay = document.getElementById('constellation-map-overlay');
    return overlay && overlay.style.display !== 'none' && !!window.EveConstellationMap?.__debugGetGraphStats?.().visible;
  }, undefined, { timeout: 10000 });
  const mapStats = await page.evaluate(() => window.EveConstellationMap.__debugGetGraphStats());
  if (mapStats.scope.scope !== 'folder' || mapStats.scope.folderId !== 'f-parent') {
    throw new Error(`Folder map scope mismatch: ${JSON.stringify(mapStats.scope)}`);
  }
  if (mapStats.nodeCount !== 4) {
    throw new Error(`Expected folder map nodeCount=4, got ${mapStats.nodeCount}`);
  }
  await page.locator('[data-map-toolbar="close"]').click();

  await page.evaluate(() => window.EveFolderViewV2.openFolderBulkTitle('Alpha', 'f-parent', 'main'));
  await page.waitForSelector('#bulkTitleModal[style*="flex"]', { timeout: 5000 });
  const bulkTitleRows = await page.evaluate(() => Array.from(document.querySelectorAll('#bulkTitleList .bulk-title-check')).map((node) => node.dataset.id));
  if (bulkTitleRows.join('|') !== 'parent-1|child-1') {
    throw new Error(`Folder bulk title leaked scope: ${bulkTitleRows.join(' | ')}`);
  }
  await page.evaluate(() => window.closeModals && window.closeModals());

  await page.evaluate(() => window.EveFolderViewV2.openFolderBulkLibraryAuto('Alpha', 'f-parent', 'main'));
  await page.waitForSelector('#bulkLibraryAutoModal[style*="flex"]', { timeout: 5000 });
  const bulkLibraryRows = await page.evaluate(() => Array.from(document.querySelectorAll('#bulkLibraryAutoList .bulk-library-auto-check')).map((node) => node.dataset.id));
  if (bulkLibraryRows.join('|') !== 'parent-1|child-1') {
    throw new Error(`Folder bulk library leaked scope: ${bulkLibraryRows.join(' | ')}`);
  }
  await page.evaluate(() => window.closeModals && window.closeModals());

  await page.evaluate(() => {
    const viewModel = window.EveBookmarkFolders.buildFolderView('main', 'Alpha', window.links.filter((link) => link.workspace === 'main' && link.category === 'Alpha'));
    const ghostNode = viewModel.nodes.find((node) => node.isGhost && node.name === '[ Unlinked Bookmarks ]' && node._ghostScopeRootId === 'f-parent');
    if (!ghostNode) throw new Error('Missing scoped ghost node for folder subtree');
    window.EveFolderViewV2.enterFolder(null, 'Alpha', ghostNode.id, 'main');
  });

  await page.waitForSelector('.folder-breadcrumb-actions', { timeout: 5000 });
  const ghostIconCount = await page.locator('.folder-breadcrumb-actions .folder-breadcrumb-icon-btn').count();
  if (ghostIconCount < 2) {
    throw new Error(`Expected ghost breadcrumb pen and map buttons, got ${ghostIconCount}`);
  }

  await page.locator('.folder-breadcrumb-actions .folder-breadcrumb-icon-btn').first().click();
  await page.waitForSelector('.folder-breadcrumb-action-tray', { timeout: 5000 });
  const ghostTrayLabels = await page.evaluate(() => Array.from(document.querySelectorAll('.folder-breadcrumb-action-tray button')).map((node) => node.textContent.trim()));
  if (ghostTrayLabels.some((value) => value.includes('Edit Folder'))) {
    throw new Error(`Ghost breadcrumb tray should not expose edit: ${ghostTrayLabels.join(' | ')}`);
  }
  ['Auto-Title', 'Auto-Library'].forEach((label) => {
    if (!ghostTrayLabels.some((value) => value.includes(label))) {
      throw new Error(`Missing ghost tray action: ${label} :: ${ghostTrayLabels.join(' | ')}`);
    }
  });

  await page.evaluate(() => {
    const viewModel = window.EveBookmarkFolders.buildFolderView('main', 'Alpha', window.links.filter((link) => link.workspace === 'main' && link.category === 'Alpha'));
    const ghostNode = viewModel.nodes.find((node) => node.isGhost && node.name === '[ Unlinked Bookmarks ]' && node._ghostScopeRootId === 'f-parent');
    if (!ghostNode) throw new Error('Missing scoped ghost node for map test');
    window.EveFolderViewV2.openFolderScopedMap('Alpha', ghostNode.id, 'main');
  });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('constellation-map-overlay');
    return overlay && overlay.style.display !== 'none' && !!window.EveConstellationMap?.__debugGetGraphStats?.().visible;
  }, undefined, { timeout: 10000 });
  const ghostMapStats = await page.evaluate(() => window.EveConstellationMap.__debugGetGraphStats());
  if (ghostMapStats.scope.scope !== 'derived') {
    throw new Error(`Ghost breadcrumb map should open derived scope, got ${JSON.stringify(ghostMapStats.scope)}`);
  }
  if (ghostMapStats.scope.scopeLabel !== '[ Unlinked Bookmarks ]') {
    throw new Error(`Ghost breadcrumb map scope label mismatch: ${JSON.stringify(ghostMapStats.scope)}`);
  }
  await page.locator('[data-map-toolbar="close"]').click();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    await runSmoke(page);
    console.log('FOLDER_SCOPED_ACTIONS_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
