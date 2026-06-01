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
      viewMode: 'unidex',
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
      hideStats: [],
      hideStatsScoped: ['main::Alpha']
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    !!window.UnidexViewModules?.createCoreHelpers
    && !!window.UnidexViewModules?.createBuilders
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
  }, seed);
}

async function runSmoke(page) {
  const snapshot = await page.evaluate(() => {
    const modules = window.UnidexViewModules;
    const state = {};
    const helpers = modules.createCoreHelpers({ state });
    const builders = modules.createBuilders({
      state,
      getAllLinks: helpers.getAllLinks,
      getWorkspaceBookmarkCount: helpers.getWorkspaceBookmarkCount,
      encodeParam: helpers.encodeParam,
      escapeHtml: helpers.escapeHtml,
      getDomain: helpers.getDomain,
      truncateText: helpers.truncateText,
      getLinkedLibraryEntry: helpers.getLinkedLibraryEntry,
      getEntryConfidence: helpers.getEntryConfidence,
      getMediaTypeLabel: helpers.getMediaTypeLabel,
      getProgressLabel: helpers.getProgressLabel,
      buildBookmarkIconHtml: function () { return ''; }
    });

    function collectEntriesFromHtml(html) {
      const container = document.createElement('div');
      container.innerHTML = html;
      return Array.from(container.querySelectorAll('.unidex-entry-item')).map((item) => ({
        title: String(item.querySelector('.unidex-entry-title')?.textContent || '').trim(),
        tags: Array.from(item.querySelectorAll('.unidex-entry-tag')).map((tag) => String(tag.textContent || '').trim())
      }));
    }

    const allLinks = Array.isArray(window.links) ? window.links.slice() : [];
    const mainLinks = allLinks.filter((link) => String(link.workspace || '') === 'main');
    const childLinks = allLinks.filter((link) => String(link.workspace || '') === 'child');

    const unifiedEntries = collectEntriesFromHtml(builders.buildEntriesHtml(allLinks, false, 'rows', {
      includeCategoryTag: true,
      resolveTaskMode: function (link) {
        return helpers.isTaskModeCategory(link.workspace || 'main', link.category || 'Unsorted');
      }
    }));
    const mainEntries = collectEntriesFromHtml(builders.buildEntriesHtml(
      mainLinks,
      helpers.isTaskModeCategory('main', 'Alpha'),
      'rows'
    ));
    const childEntries = collectEntriesFromHtml(builders.buildEntriesHtml(
      childLinks,
      helpers.isTaskModeCategory('child', 'Alpha'),
      'rows'
    ));

    return {
      unifiedEntries,
      mainEntries,
      childEntries
    };
  });

  const unifiedMain = snapshot.unifiedEntries.find((entry) => entry.title === 'Main Alpha One');
  const unifiedChild = snapshot.unifiedEntries.find((entry) => entry.title === 'Child Alpha One');
  if (!unifiedMain || !unifiedChild) {
    throw new Error('Unified Unidex entry builder did not include both scoped entries: ' + JSON.stringify(snapshot));
  }
  if (unifiedMain.tags.some((tag) => tag === 'Pending')) {
    throw new Error('Unified Unidex entry builder leaked task mode onto main::Alpha: ' + JSON.stringify(snapshot));
  }
  if (!unifiedChild.tags.some((tag) => tag === 'Pending')) {
    throw new Error('Unified Unidex entry builder lost task mode for child::Alpha: ' + JSON.stringify(snapshot));
  }

  if (snapshot.mainEntries.length !== 1 || snapshot.mainEntries[0].title !== 'Main Alpha One') {
    throw new Error('Main scoped Unidex entries did not isolate correctly: ' + JSON.stringify(snapshot));
  }
  if (snapshot.mainEntries[0].tags.some((tag) => tag === 'Pending')) {
    throw new Error('Main scoped Unidex entries still show task mode for main::Alpha: ' + JSON.stringify(snapshot));
  }

  if (snapshot.childEntries.length !== 1 || snapshot.childEntries[0].title !== 'Child Alpha One') {
    throw new Error('Child scoped Unidex entries did not isolate correctly: ' + JSON.stringify(snapshot));
  }
  if (!snapshot.childEntries[0].tags.some((tag) => tag === 'Pending')) {
    throw new Error('Child scoped Unidex entries lost task mode for child::Alpha: ' + JSON.stringify(snapshot));
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
