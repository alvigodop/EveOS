const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      {
        id: 'existing-link',
        title: 'Existing Arc Link',
        url: 'https://example.com/existing',
        workspace: 'main',
        category: 'TargetCard',
        folderId: 'folder-arc-1'
      }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder' }
      ],
      categoryOrder: ['TargetCard'],
      cardFolderViewModes: {
        'main::TargetCard': true
      }
    },
    bookmarkFolders: {
      'main::TargetCard': {
        nodes: [
          { id: 'folder-series', parentId: null, name: 'Series', order: 0 },
          { id: 'folder-arc-1', parentId: 'folder-series', name: 'Arc 1', order: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.processBulk === 'function'
    && typeof window.openBulkModal === 'function'
    && !!window.EveBulkImport?._api
    && typeof window.EveBookmarkFolders?.getScopedNodes === 'function'
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

async function runSmoke(page) {
  await page.evaluate(async () => {
    window.openBulkModal();
    document.getElementById('bulkCategory').value = 'TargetCard';
    const radio = document.getElementById('bulkModeFolder');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    window.EveBulkImport._api._accumulatedFolderFiles = [
      {
        name: 'One.txt',
        customRelativePath: 'Series/Arc 1/One.txt',
        size: 10,
        lastModified: 1,
        text: async () => 'https://example.com/one'
      },
      {
        name: 'Two.txt',
        customRelativePath: 'Series/Arc 2/Two.txt',
        size: 10,
        lastModified: 2,
        text: async () => 'https://example.com/two'
      },
      {
        name: 'Three.txt',
        customRelativePath: 'Series/Three.txt',
        size: 10,
        lastModified: 3,
        text: async () => 'https://example.com/three'
      }
    ];

    await window.processBulk();
  });

  const state = await page.evaluate(() => {
    const nodes = window.EveBookmarkFolders.getScopedNodes('main', 'TargetCard');
    const linksInCard = window.links.filter((link) => String(link.category || '') === 'TargetCard');
    const rootSeries = nodes.filter((node) => !node.parentId && node.name === 'Series');
    const seriesId = rootSeries[0]?.id || '';
    const arc1Children = nodes.filter((node) => node.parentId === seriesId && node.name === 'Arc 1');
    const arc2Children = nodes.filter((node) => node.parentId === seriesId && node.name === 'Arc 2');

    return {
      nodeCount: nodes.length,
      rootSeriesCount: rootSeries.length,
      arc1Count: arc1Children.length,
      arc2Count: arc2Children.length,
      seriesId,
      arc1Id: arc1Children[0]?.id || '',
      arc2Id: arc2Children[0]?.id || '',
      linkMap: linksInCard.map((link) => ({
        title: String(link.title || ''),
        folderId: String(link.folderId || '')
      }))
    };
  });

  if (state.rootSeriesCount !== 1) {
    throw new Error(`Expected 1 root Series folder, got ${state.rootSeriesCount}`);
  }
  if (state.arc1Count !== 1) {
    throw new Error(`Expected 1 Arc 1 child folder, got ${state.arc1Count}`);
  }
  if (state.arc2Count !== 1) {
    throw new Error(`Expected 1 Arc 2 child folder, got ${state.arc2Count}`);
  }
  if (state.nodeCount !== 3) {
    throw new Error(`Expected 3 total folders after merge import, got ${state.nodeCount}`);
  }

  const byTitle = new Map(state.linkMap.map((entry) => [entry.title, entry.folderId]));
  if (byTitle.get('One') !== state.arc1Id) {
    throw new Error(`Expected One to merge into existing Arc 1 folder, got ${byTitle.get('One') || '(none)'}`);
  }
  if (byTitle.get('Two') !== state.arc2Id) {
    throw new Error(`Expected Two to land in new Arc 2 folder, got ${byTitle.get('Two') || '(none)'}`);
  }
  if (byTitle.get('Three') !== state.seriesId) {
    throw new Error(`Expected Three to land in existing Series folder, got ${byTitle.get('Three') || '(none)'}`);
  }
  if (byTitle.get('Existing Arc Link') !== state.arc1Id) {
    throw new Error(`Existing link drifted out of Arc 1 folder: ${byTitle.get('Existing Arc Link') || '(none)'}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    await runSmoke(page);
    console.log('BULK_FOLDER_MERGE_BROWSER_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error('BULK_FOLDER_MERGE_BROWSER_SMOKE_FAIL:', error && error.message ? error.message : error);
  process.exit(1);
});
