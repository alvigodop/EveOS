const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'alpha-root', title: 'Alpha Root Bookmark', url: 'https://example.com/alpha-root', workspace: 'main', category: 'Alpha', done: false, tags: ['alpha', 'root'] },
      { id: 'alpha-folder', title: 'Alpha Folder Bookmark', url: 'https://example.com/alpha-folder', workspace: 'main', category: 'Alpha', folderId: 'alpha-folder', done: false, tags: ['alpha', 'folder'] },
      { id: 'alpha-subfolder', title: 'Alpha Nested Bookmark', url: 'https://example.com/alpha-sub', workspace: 'main', category: 'Alpha', folderId: 'alpha-sub', done: false, tags: ['alpha', 'nested'] },
      { id: 'beta-child', title: 'Beta Child Bookmark', url: 'https://example.com/beta-child', workspace: 'child', category: 'Beta', done: false, tags: ['beta', 'child'] }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      showInactiveTabs: true,
      showHiddenSidebarGroups: true,
      workspaces: [
        {
          id: 'main',
          name: 'Main',
          icon: 'folder',
          subTabs: [
            { id: 'child', name: 'Child Tab', icon: 'folder', hiddenInParent: false, subTabs: [] }
          ]
        }
      ],
      categoryOrder: ['Alpha', 'Beta']
    },
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'alpha-folder', parentId: null, name: 'Research', order: 0 },
          { id: 'alpha-sub', parentId: 'alpha-folder', name: 'Deep Notes', order: 0 }
        ]
      }
    },
    libraries: {
      'main::Alpha': {
        dataType: 'graphicNovels',
        entries: [
          {
            id: 'lib-alpha-1',
            title: 'Alpha Library',
            summary: 'Alpha library summary',
            status: 'Reading',
            author: 'Nova',
            genre: 'Test'
          }
        ]
      }
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && !!window.EveOS?.SearchAdvanced?.Index
    && !!window.EveConstellationMap?.openAllMap
    && !!window.EveBookmarkFolders?.buildFolderView
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
      localStorage.removeItem('eve.nexusIndex.v1');
      localStorage.removeItem('eve.nexusIndex.v2');
      localStorage.setItem('eveV22Data', JSON.stringify(links));
      localStorage.setItem('eveV22Config', JSON.stringify(config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(bookmarkFolders));
    } catch (error) {
      // file:// can reject localStorage writes
    }

    if (window.EveLibrary?.State?.setAllLibraries) {
      window.EveLibrary.State.setAllLibraries(JSON.parse(JSON.stringify(payload.libraries || {})));
    }

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'constellation-smoke-seed' } }));
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
    await window.EveOS.SearchAdvanced.Index.rebuild({ reason: 'constellation-smoke' });
  }, seed);
}

async function runSmoke(page) {
  const folderSearch = await page.evaluate(async () => {
    const result = await window.EveOS.SearchAdvanced.Index.search('Research', { workspaceId: 'main' }, {
      activeVectors: { bookmarks: true, knowledge: false, cachedResults: false }
    });
    return {
      total: result.records.length,
      folderHit: result.records.some((record) => record.type === 'folder' && String(record.title || '').includes('Research'))
    };
  });

  if (!folderSearch.folderHit) {
    throw new Error('Folder records were not indexed for Nexus search: ' + JSON.stringify(folderSearch));
  }

  await page.evaluate(async () => {
    await window.EveConstellationMap.openAllMap();
  });

  await page.waitForFunction(() => {
    const state = window.EveConstellationMap?._shared?.state;
    return !!state
      && state.container?.style?.display === 'block'
      && Array.isArray(state.nodes)
      && state.nodes.length > 0;
  }, undefined, { timeout: 15000 });

  const result = await page.evaluate(async () => {
    const state = window.EveConstellationMap._shared.state;
    const graphStats = window.EveConstellationMap._coreDebugGraph.__debugGetGraphStats();
    const projectionStats = await window.EveConstellationMap._coreDebugGraph.__debugGetNexusProjectionStats({ scope: 'all' });
    const nestedFolderNode = state.nodes.find((node) => node.kind === 'folder' && String(node.data?.folderId || '') === 'alpha-sub');

    return {
      graphStats,
      projectionStats,
      hasNexusMappedNodes: state.nodes.some((node) => !!node.data?.nexusId),
      hasProjectedFolderNode: state.nodes.some((node) => node.kind === 'folder' && !!node.data?.nexusId),
      hasProjectedWorkspaceNode: state.nodes.some((node) => node.kind === 'workspace' && !!node.data?.nexusId),
      hasProjectedCategoryNode: state.nodes.some((node) => node.kind === 'category' && !!node.data?.nexusId),
      nestedFolderAnchor: nestedFolderNode?.data?.anchorNodeId || '',
      nestedFolderSourceType: nestedFolderNode?.data?.sourceType || ''
    };
  });

  if (!result.hasNexusMappedNodes) {
    throw new Error('Constellation map did not consume Nexus projection nodes');
  }
  if (!result.hasProjectedWorkspaceNode || !result.hasProjectedCategoryNode || !result.hasProjectedFolderNode) {
    throw new Error('Expected projected workspace/category/folder nodes are missing: ' + JSON.stringify(result));
  }
  if (String(result.nestedFolderAnchor || '') !== 'folder_main_Alpha_alpha-folder') {
    throw new Error('Nested folder did not attach to its parent folder: ' + JSON.stringify(result));
  }
  if (String(result.nestedFolderSourceType || '') !== 'folder') {
    throw new Error('Nested folder should retain folder source type metadata: ' + JSON.stringify(result));
  }
  if ((result.projectionStats?.projection?.nodeCount || 0) <= 0) {
    throw new Error('Projection stats did not report Nexus graph nodes: ' + JSON.stringify(result));
  }

  return result;
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
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
