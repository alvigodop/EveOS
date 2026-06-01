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
    && typeof window.ctxCatToggleTask === 'function'
    && typeof window.confirmRename === 'function'
    && !!window.EveBookmarkFolders
    && !!window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt
  ), undefined, { timeout: 120000 });
  await page.waitForTimeout(250);
}

async function seedState(page, seed) {
  await page.evaluate((payload) => {
    config = JSON.parse(JSON.stringify(payload.config));
    links = JSON.parse(JSON.stringify(payload.links));
    window.config = config;
    window.links = links;
    window.showToast = function () {};
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function runSmoke(page) {
  const snapshot = await page.evaluate(() => {
    const folderApi = window.EveBookmarkFolders;
    const legacyMigration = {
      mainTaskEnabled: !!folderApi.isCardTaskEnabled('main', 'Alpha'),
      childTaskEnabled: !!folderApi.isCardTaskEnabled('child', 'Alpha'),
      hideStats: Array.isArray(window.config?.hideStats) ? window.config.hideStats.slice() : [],
      hideStatsScoped: Array.isArray(window.config?.hideStatsScoped) ? window.config.hideStatsScoped.slice().sort() : []
    };

    window.ctxWsId = 'child';
    window.ctxCatName = 'Alpha';
    window.ctxCatToggleTask();

    const afterToggle = {
      mainTaskEnabled: !!folderApi.isCardTaskEnabled('main', 'Alpha'),
      childTaskEnabled: !!folderApi.isCardTaskEnabled('child', 'Alpha'),
      hideStats: Array.isArray(window.config?.hideStats) ? window.config.hideStats.slice() : [],
      hideStatsScoped: Array.isArray(window.config?.hideStatsScoped) ? window.config.hideStatsScoped.slice().sort() : []
    };

    const fakeEvent = {
      preventDefault: function () {},
      stopPropagation: function () {},
      clientX: 20,
      clientY: 20
    };
    window.showCategoryContextMenu(fakeEvent, 'Alpha', 'child');
    const menuItems = Array.from(document.querySelectorAll('#cat-context-menu .ctx-item')).map((node) => String(node.textContent || '').trim());

    window.ctxWsId = 'main';
    document.getElementById('oldCatName').value = 'Alpha';
    document.getElementById('renameInput').value = 'Beta';
    window.confirmRename();

    const afterRename = {
      mainBetaTaskEnabled: !!folderApi.isCardTaskEnabled('main', 'Beta'),
      childAlphaTaskEnabled: !!folderApi.isCardTaskEnabled('child', 'Alpha'),
      hideStats: Array.isArray(window.config?.hideStats) ? window.config.hideStats.slice() : [],
      hideStatsScoped: Array.isArray(window.config?.hideStatsScoped) ? window.config.hideStatsScoped.slice().sort() : [],
      links: (Array.isArray(window.links) ? window.links : []).map((link) => ({
        id: link.id,
        workspace: link.workspace,
        category: link.category
      })).sort((left, right) => String(left.id).localeCompare(String(right.id)))
    };

    return {
      legacyMigration,
      afterToggle,
      afterRename,
      menuItems
    };
  });

  const expectedLegacyScoped = JSON.stringify(['child::Alpha', 'main::Alpha']);
  if (snapshot.legacyMigration.mainTaskEnabled || snapshot.legacyMigration.childTaskEnabled) {
    throw new Error('Legacy hideStats migration did not preserve disabled task mode: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.legacyMigration.hideStatsScoped) !== expectedLegacyScoped) {
    throw new Error('Legacy hideStats migration did not expand to scoped keys: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.legacyMigration.hideStats) !== JSON.stringify([])) {
    throw new Error('Legacy hideStats migration did not clear migrated legacy entries: ' + JSON.stringify(snapshot));
  }

  if (snapshot.afterToggle.mainTaskEnabled || !snapshot.afterToggle.childTaskEnabled) {
    throw new Error('Task mode toggle bled across workspaces: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.afterToggle.hideStatsScoped) !== JSON.stringify(['main::Alpha'])) {
    throw new Error('Task mode toggle wrote the wrong scoped store: ' + JSON.stringify(snapshot));
  }
  if (!snapshot.menuItems.some((item) => item.includes('Task Mode') && item.includes('✓'))) {
    throw new Error('Task mode menu label did not reflect the child workspace state: ' + JSON.stringify(snapshot));
  }

  if (snapshot.afterRename.mainBetaTaskEnabled || !snapshot.afterRename.childAlphaTaskEnabled) {
    throw new Error('Task mode rename did not keep scopes isolated: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.afterRename.hideStatsScoped) !== JSON.stringify(['main::Beta'])) {
    throw new Error('Task mode rename did not move the scoped key: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.afterRename.hideStats) !== JSON.stringify([])) {
    throw new Error('Task mode rename unexpectedly reintroduced legacy hideStats: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(snapshot.afterRename.links) !== JSON.stringify([
    { id: 'child-alpha-1', workspace: 'child', category: 'Alpha' },
    { id: 'main-alpha-1', workspace: 'main', category: 'Beta' }
  ])) {
    throw new Error('Category rename did not stay workspace-scoped while moving task mode: ' + JSON.stringify(snapshot));
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
