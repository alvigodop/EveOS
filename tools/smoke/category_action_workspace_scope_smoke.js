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
      hideStats: [],
      smartCardWeights: [],
      customOrderEnabled: [],
      customOrder: {},
      customOrderSort: {},
      trueValueEnabled: []
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.showCategoryContextMenu === 'function'
    && typeof window.ctxCatToggleSmartBadge === 'function'
    && typeof window.ctxCatToggleCustomOrder === 'function'
    && typeof window.ctxCatCycleSortOrder === 'function'
    && typeof window.ctxCatToggleTrueValue === 'function'
    && !!window.EveCustomOrder
    && !!window.EveTrueValue
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
    if (window.eveState) {
      window.eveState.config = config;
      window.eveState.links = links;
    }

    window.showToast = function () {};
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function runSmoke(page) {
  const snapshot = await page.evaluate(() => {
    window.ctxWsId = 'child';
    window.ctxCatName = 'Alpha';
    window.ctxCatToggleSmartBadge();
    window.ctxCatToggleCustomOrder();
    window.ctxCatCycleSortOrder();
    window.ctxCatToggleTrueValue();

    const fakeEvent = {
      preventDefault: function () {},
      stopPropagation: function () {},
      clientX: 20,
      clientY: 20
    };
    window.showCategoryContextMenu(fakeEvent, 'Alpha', 'child');
    const menu = document.getElementById('cat-context-menu');
    const items = Array.from(menu?.querySelectorAll('.ctx-item') || []).map((node) => String(node.textContent || '').trim());
    const settingsItem = menu?.querySelector('.ctx-item[data-ws]');
    const renameItem = menu?.querySelector('.ctx-item[data-ws][data-cat]');

    return {
      smartCardWeights: Array.isArray(window.config?.smartCardWeights) ? window.config.smartCardWeights.slice() : [],
      customOrderMainEnabled: !!window.EveCustomOrder.isEnabled('main', 'Alpha'),
      customOrderChildEnabled: !!window.EveCustomOrder.isEnabled('child', 'Alpha'),
      customOrderMainSort: window.EveCustomOrder.getSortMode('main', 'Alpha'),
      customOrderChildSort: window.EveCustomOrder.getSortMode('child', 'Alpha'),
      trueValueMainEnabled: !!window.EveTrueValue.isEnabled('main', 'Alpha'),
      trueValueChildEnabled: !!window.EveTrueValue.isEnabled('child', 'Alpha'),
      menuItems: items,
      settingsWs: String(settingsItem?.dataset.ws || ''),
      renameWs: String(renameItem?.dataset.ws || '')
    };
  });

  if (JSON.stringify(snapshot.smartCardWeights) !== JSON.stringify(['child::Alpha'])) {
    throw new Error('Smart badge toggle wrote to the wrong workspace scope: ' + JSON.stringify(snapshot));
  }
  if (snapshot.customOrderMainEnabled || !snapshot.customOrderChildEnabled) {
    throw new Error('Custom order toggle used the wrong workspace scope: ' + JSON.stringify(snapshot));
  }
  if (snapshot.customOrderMainSort !== 'none' || snapshot.customOrderChildSort !== 'asc') {
    throw new Error('Custom order sort cycle used the wrong workspace scope: ' + JSON.stringify(snapshot));
  }
  if (snapshot.trueValueMainEnabled || !snapshot.trueValueChildEnabled) {
    throw new Error('True value toggle used the wrong workspace scope: ' + JSON.stringify(snapshot));
  }
  if (snapshot.settingsWs !== 'child' || snapshot.renameWs !== 'child') {
    throw new Error('Category context menu did not retain child workspace routing: ' + JSON.stringify(snapshot));
  }
  if (!snapshot.menuItems.some((item) => item.includes('Custom Numbering') && item.includes('✓'))) {
    throw new Error('Context menu label did not reflect child custom-order state: ' + JSON.stringify(snapshot));
  }
  if (!snapshot.menuItems.some((item) => item.includes('True Value Sort') && item.includes('✓'))) {
    throw new Error('Context menu label did not reflect child true-value state: ' + JSON.stringify(snapshot));
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
