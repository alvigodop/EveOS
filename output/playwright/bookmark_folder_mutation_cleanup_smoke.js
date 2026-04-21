const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildConfig(activeWorkspace = 'main') {
  return {
    activeWorkspace,
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
    categoryOrder: ['Alpha', 'Beta'],
    categoryOrderByWorkspace: {
      main: ['Alpha', 'Beta'],
      child: ['Alpha']
    },
    hideStats: [],
    hideStatsScoped: []
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && !!window.EveOS?.DatapackIndex
    && !!window.EveBookmarkFolders?.deleteFolder
    && !!window.EveBookmarkFolders?.transferFolderToCategory
    && !!window.EveBookmarkFolders?.moveLinksToFolderTarget
    && !!window.EveLibrary?.ConnectionsAPI?.removeByLinkId
    && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt
  ), undefined, { timeout: 120000 });
  await page.waitForTimeout(250);
}

async function seedState(page, payload) {
  await page.evaluate(async (seed) => {
    config = JSON.parse(JSON.stringify(seed.config));
    links = JSON.parse(JSON.stringify(seed.links));
    bookmarkFolders = {};
    window.config = config;
    window.links = links;
    window.bookmarkFolders = bookmarkFolders;
    window.showToast = function () {};
    window.showConfirm = async function () { return true; };

    if (window.eveState) {
      window.eveState.config = config;
      window.eveState.links = links;
      window.eveState.bookmarkFolders = bookmarkFolders;
    }

    const folderShared = window.EveBookmarkFolders?._shared || null;
    if (typeof folderShared?.writeStore === 'function') {
      folderShared.writeStore({}, false);
    }
    Object.keys(seed.bookmarkFolders || {}).forEach((scopedKey) => {
      const parts = String(scopedKey || '').split('::');
      const workspaceId = String(parts[0] || 'main').trim() || 'main';
      const categoryName = String(parts.slice(1).join('::') || 'Unsorted').trim() || 'Unsorted';
      folderShared.setScopedTree(workspaceId, categoryName, seed.bookmarkFolders[scopedKey], { persist: false });
    });

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'bookmark-folder-mutation-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'bookmark-folder-mutation-seed' });
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, payload);
}

async function runCategoryCleanupPhase(page) {
  await seedState(page, {
    links: [
      { id: 'main-alpha-root-1', title: 'Main Root', url: 'https://example.com/main-root', workspace: 'main', category: 'Alpha', done: false },
      { id: 'main-alpha-folder-1', title: 'Main Folder Link', url: 'https://example.com/main-folder-link', workspace: 'main', category: 'Alpha', folderId: 'folder-a', done: false },
      { id: 'child-alpha-1', title: 'Child Alpha', url: 'https://example.com/child-alpha', workspace: 'child', category: 'Alpha', done: false }
    ],
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'folder-a', name: 'Folder A', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      },
      'child::Alpha': {
        nodes: [
          { id: 'folder-child', name: 'Child Folder', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: buildConfig('main')
  });

  const snapshot = await page.evaluate(async () => {
    const removeCalls = [];
    const api = window.EveLibrary.ConnectionsAPI;
    const originalRemove = api.removeByLinkId;
    api.removeByLinkId = function (linkId) {
      removeCalls.push(String(linkId || '').trim());
      return typeof originalRemove === 'function' ? originalRemove.apply(this, arguments) : undefined;
    };

    const nextLinks = (Array.isArray(window.links) ? window.links : []).filter((link) => String(link?.workspace || '') !== 'main');
    links = nextLinks;
    window.links = nextLinks;
    if (window.eveState) window.eveState.links = nextLinks;

    window.ctxWsId = 'main';
    window.ctxCatName = 'Alpha';
    const hasUsableSnapshot = !!window.EveOS.DatapackIndex.hasUsableSnapshot?.();
    await window.deleteCategory('Alpha');

    api.removeByLinkId = originalRemove;

    return {
      hasUsableSnapshot,
      removeCalls: removeCalls.slice().sort(),
      linksState: (Array.isArray(window.links) ? window.links : []).map((link) => ({
        id: String(link?.id || '').trim(),
        workspace: String(link?.workspace || '').trim(),
        category: String(link?.category || '').trim()
      })).sort((left, right) => left.id.localeCompare(right.id)),
      folderKeys: Object.keys(window.eveState?.bookmarkFolders || window.bookmarkFolders || {}).sort()
    };
  });

  if (!snapshot.hasUsableSnapshot) {
    throw new Error('Category cleanup phase started without a usable datapack snapshot: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.removeCalls) !== JSON.stringify(['main-alpha-folder-1', 'main-alpha-root-1'])) {
    throw new Error('Category delete did not clean indexed link IDs: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.linksState) !== JSON.stringify([
    { id: 'child-alpha-1', workspace: 'child', category: 'Alpha' }
  ])) {
    throw new Error('Category delete mutated the wrong live links: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.folderKeys) !== JSON.stringify(['child::Alpha'])) {
    throw new Error('Category delete removed the wrong bookmark folder scopes: ' + JSON.stringify(snapshot));
  }

  return snapshot;
}

async function runFolderCleanupPhase(page) {
  await seedState(page, {
    links: [
      { id: 'alpha-root-1', title: 'Alpha Root', url: 'https://example.com/alpha-root', workspace: 'main', category: 'Alpha', done: false },
      { id: 'alpha-folder-1', title: 'Alpha Folder', url: 'https://example.com/alpha-folder', workspace: 'main', category: 'Alpha', folderId: 'folder-a', done: false }
    ],
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'folder-a', name: 'Folder A', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: buildConfig('main')
  });

  const snapshot = await page.evaluate(() => {
    const removeCalls = [];
    const api = window.EveLibrary.ConnectionsAPI;
    const originalRemove = api.removeByLinkId;
    api.removeByLinkId = function (linkId) {
      removeCalls.push(String(linkId || '').trim());
      return typeof originalRemove === 'function' ? originalRemove.apply(this, arguments) : undefined;
    };

    const nextLinks = (Array.isArray(window.links) ? window.links : []).filter((link) => String(link?.id || '').trim() !== 'alpha-folder-1');
    links = nextLinks;
    window.links = nextLinks;
    if (window.eveState) window.eveState.links = nextLinks;

    const deleted = !!window.EveBookmarkFolders.deleteFolder({
      workspaceId: 'main',
      categoryName: 'Alpha',
      folderId: 'folder-a'
    });

    api.removeByLinkId = originalRemove;

    return {
      deleted,
      removeCalls: removeCalls.slice().sort(),
      linksState: (Array.isArray(window.links) ? window.links : []).map((link) => String(link?.id || '').trim()).sort(),
      folderKeys: Object.keys(window.eveState?.bookmarkFolders || window.bookmarkFolders || {}).sort()
    };
  });

  if (!snapshot.deleted) {
    throw new Error('Folder delete returned false: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.removeCalls) !== JSON.stringify(['alpha-folder-1'])) {
    throw new Error('Folder delete did not clean indexed subtree IDs: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.linksState) !== JSON.stringify(['alpha-root-1'])) {
    throw new Error('Folder delete removed the wrong live links: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.folderKeys) !== JSON.stringify([])) {
    throw new Error('Folder delete left behind an empty folder scope: ' + JSON.stringify(snapshot));
  }

  return snapshot;
}

async function runEditorFallbackPhase(page) {
  await seedState(page, {
    links: [
      { id: 'editor-link-1', title: 'Editor Link', url: 'https://example.com/editor-link', workspace: 'main', category: 'Alpha', folderId: 'folder-a', done: false }
    ],
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'folder-a', name: 'Folder A', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: buildConfig('child')
  });

  const snapshot = await page.evaluate(() => {
    const nextLinks = [];
    links = nextLinks;
    window.links = nextLinks;
    if (window.eveState) window.eveState.links = nextLinks;

    const ensureInput = function (id, tagName) {
      let element = document.getElementById(id);
      if (!element) {
        element = document.createElement(tagName);
        element.id = id;
        document.body.appendChild(element);
      }
      return element;
    };

    const editId = ensureInput('editId', 'input');
    const newCategory = ensureInput('newCategory', 'input');
    const newFolderId = ensureInput('newFolderId', 'select');

    editId.value = 'editor-link-1';
    newCategory.value = 'Alpha';
    window.EveBookmarkFolders.refreshEditorFolderSelect('folder-a');

    return {
      options: Array.from(newFolderId.options).map((option) => ({
        value: String(option.value || '').trim(),
        label: String(option.textContent || '').trim()
      })),
      selectedValue: String(newFolderId.value || '').trim()
    };
  });

  if (!snapshot.options.some((option) => option.value === 'folder-a' && option.label.includes('Folder A'))) {
    throw new Error('Editor folder select did not resolve the indexed workspace scope: ' + JSON.stringify(snapshot));
  }
  if (snapshot.selectedValue !== 'folder-a') {
    throw new Error('Editor folder select did not preserve the preferred folder selection: ' + JSON.stringify(snapshot));
  }

  return snapshot;
}

async function runWindowLinksFallbackPhase(page) {
  await seedState(page, {
    links: [
      { id: 'move-link-1', title: 'Move Link', url: 'https://example.com/move-link', workspace: 'main', category: 'Alpha', done: false }
    ],
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'folder-a', name: 'Folder A', parentId: null, order: 0, createdAt: 1, updatedAt: 1 }
        ],
        settings: { clickBehaviorMode: 'inherit' }
      },
      'main::Beta': {
        nodes: [],
        settings: { clickBehaviorMode: 'inherit' }
      }
    },
    config: buildConfig('main')
  });

  const snapshot = await page.evaluate(() => {
    if (window.eveState) window.eveState.links = null;

    const movedToFolder = !!window.EveBookmarkFolders.moveLinksToFolderTarget(['move-link-1'], 'main', 'Alpha', 'folder-a', {
      persist: false,
      skipRender: true,
      skipSuggestions: true
    });

    const transferredFolder = !!window.EveBookmarkFolders.transferFolderToCategory('folder-a', 'main', 'Alpha', 'main', 'Beta', '', {
      persist: false
    });

    const currentLinks = Array.isArray(window.links) ? window.links.map((link) => ({
      id: String(link?.id || '').trim(),
      workspace: String(link?.workspace || '').trim(),
      category: String(link?.category || '').trim(),
      folderId: String(link?.folderId || '').trim()
    })) : [];
    const folderKeys = Object.keys(window.eveState?.bookmarkFolders || window.bookmarkFolders || {}).sort();

    return {
      movedToFolder,
      transferredFolder,
      currentLinks,
      folderKeys
    };
  });

  if (!snapshot.movedToFolder) {
    throw new Error('Folder move did not operate from window.links fallback: ' + JSON.stringify(snapshot));
  }
  if (!snapshot.transferredFolder) {
    throw new Error('Folder transfer did not operate from window.links fallback: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.currentLinks) !== JSON.stringify([
    { id: 'move-link-1', workspace: 'main', category: 'Beta', folderId: 'folder-a' }
  ])) {
    throw new Error('Window.links fallback mutations wrote the wrong live link state: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.folderKeys) !== JSON.stringify(['main::Beta'])) {
    throw new Error('Window.links fallback mutations wrote the wrong folder scopes: ' + JSON.stringify(snapshot));
  }

  return snapshot;
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

    const smoke = {
      categoryCleanup: await runCategoryCleanupPhase(page),
      folderCleanup: await runFolderCleanupPhase(page),
      editorFallback: await runEditorFallbackPhase(page),
      windowLinksFallback: await runWindowLinksFallbackPhase(page)
    };

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
