const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      {
        id: 'resolver-alpha-1',
        title: 'Resolver Alpha',
        url: 'https://example.com/resolver-alpha',
        workspace: 'main',
        category: 'Alpha',
        done: false
      }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      showInactiveTabs: true,
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
    && !!window.EveContextMenuActions?.getCtxLink
    && !!window.DashboardCategoriesModules?.focusedLinkHelpers?.getLinkById
    && !!window.DashboardCategoriesModules?.focusedLinkView?.openFocusedEntryDirect
    && !!window.UnidexViewModules?.createCoreHelperState
    && !!window.UnidexViewModules?.createCoreEntryActions
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

    try {
      localStorage.removeItem('eve.nexusIndex.v1');
      localStorage.removeItem('eve.nexusIndex.v2');
      localStorage.setItem('eveV22Data', JSON.stringify(links));
      localStorage.setItem('eveV22Config', JSON.stringify(config));
    } catch (error) {
      // file:// can reject localStorage writes
    }

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'resolver-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'resolver-seed' });
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function runSmoke(page) {
  const result = await page.evaluate(() => {
    const linkId = 'resolver-alpha-1';
    links = [];
    window.links = [];
    if (window.eveState) window.eveState.links = [];

    const resolved = window.EveOS.DatapackIndex.resolveBookmarkLink(linkId);
    const focusedLink = window.DashboardCategoriesModules.focusedLinkHelpers.getLinkById(linkId);

    window.ctxLinkId = linkId;
    const contextLink = window.EveContextMenuActions.getCtxLink();

    const helperState = window.UnidexViewModules.createCoreHelperState({ state: {} });
    const helperResolved = helperState.resolveLinkById(linkId);
    const unidexActions = window.UnidexViewModules.createCoreEntryActions({
      helpers: Object.assign({}, helperState, {
        decodeParam: function (value) { return String(value || ''); }
      }),
      normalizeEntryUrl: function (url) { return url; },
      openUrl: function (url) { window.__resolverUnidexOpen = url; }
    });

    const originalOpen = window.open;
    window.__resolverFocusedOpen = '';
    window.open = function (url) {
      window.__resolverFocusedOpen = String(url || '');
      return null;
    };

    try {
      window.DashboardCategoriesModules.focusedLinkView.openFocusedEntryDirect(linkId, {
        preventDefault: function () {},
        stopPropagation: function () {}
      });
      unidexActions.openEntryDirect(linkId, {
        preventDefault: function () {},
        stopPropagation: function () {}
      });
    } finally {
      window.open = originalOpen;
    }

    return {
      resolved,
      focusedLink,
      contextLink,
      helperResolved,
      focusedOpen: window.__resolverFocusedOpen,
      unidexOpen: window.__resolverUnidexOpen || ''
    };
  });

  ['resolved', 'focusedLink', 'contextLink', 'helperResolved'].forEach((key) => {
    const value = result[key];
    if (!value || value.id !== 'resolver-alpha-1' || value.title !== 'Resolver Alpha' || value.url !== 'https://example.com/resolver-alpha') {
      throw new Error('Resolver path missing fallback bookmark payload for ' + key + ': ' + JSON.stringify(result));
    }
  });

  if (result.focusedOpen !== 'https://example.com/resolver-alpha') {
    throw new Error('Focused entry direct open did not use datapack resolver: ' + JSON.stringify(result));
  }
  if (result.unidexOpen !== 'https://example.com/resolver-alpha') {
    throw new Error('Unidex entry direct open did not use datapack resolver: ' + JSON.stringify(result));
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
