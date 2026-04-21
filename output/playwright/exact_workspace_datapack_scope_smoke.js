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
      hideStats: []
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && !!window.UnidexView
    && !!window.EveOS?.DatapackIndex
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

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'exact-scope-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'exact-scope-seed' });
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function injectRawDrift(page) {
  await page.evaluate(() => {
    const driftLink = {
      id: 'main-alpha-drift',
      title: 'Main Alpha Drift',
      url: 'https://example.com/main-alpha-drift',
      workspace: 'main',
      category: 'Alpha',
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

async function readDashboardCardTitles(page, workspaceId) {
  return page.evaluate((wsId) => {
    const card = document.querySelector(`.category-card[data-card-category="Alpha"][data-card-workspace="${wsId}"]`);
    return Array.from(card?.querySelectorAll('li a') || [])
      .map((node) => String(node.textContent || '').trim())
      .filter(Boolean);
  }, workspaceId);
}

async function runSmoke(page) {
  await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="main"]', { timeout: 15000 });
  await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="child"]', { timeout: 15000 });

  const mainDashboardTitles = await readDashboardCardTitles(page, 'main');
  const childDashboardTitles = await readDashboardCardTitles(page, 'child');

  if (!mainDashboardTitles.includes('Main Alpha One') || mainDashboardTitles.includes('Child Alpha One') || mainDashboardTitles.includes('Main Alpha Drift')) {
    throw new Error('Main dashboard card leaked cross-workspace or drift links: ' + JSON.stringify(mainDashboardTitles));
  }
  if (!childDashboardTitles.includes('Child Alpha One') || childDashboardTitles.includes('Main Alpha One') || childDashboardTitles.includes('Main Alpha Drift')) {
    throw new Error('Child dashboard card leaked cross-workspace or drift links: ' + JSON.stringify(childDashboardTitles));
  }

  await page.evaluate(() => {
    config.viewMode = 'unidex';
    if (window.eveState?.config) window.eveState.config.viewMode = 'unidex';
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  });

  await page.waitForSelector('.unidex-shell .unidex-tabs', { timeout: 15000 });
  await page.locator('.unidex-tab-btn', { hasText: 'Main' }).first().click();
  await page.waitForSelector('.unidex-shell .unidex-cards', { timeout: 15000 });

  const unidexCards = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.unidex-cards .unidex-card')).map((card) => ({
      title: String(card.querySelector('.unidex-card-title')?.textContent || '').trim(),
      total: String(card.querySelector('.unidex-card-pill')?.textContent || '').trim()
    }));
  });

  const alphaCard = unidexCards.find((card) => card.title === 'Alpha');
  if (!alphaCard || alphaCard.total !== '1') {
    throw new Error('Unidex main Alpha card should stay exact-scoped at 1 bookmark: ' + JSON.stringify(unidexCards));
  }

  await page.locator('.unidex-card-hit', { hasText: 'Alpha' }).first().click();
  await page.waitForSelector('.unidex-shell .unidex-entries', { timeout: 15000 });

  const unidexEntryTitles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.unidex-entry-title')).map((node) => String(node.textContent || '').trim()).filter(Boolean);
  });

  if (!unidexEntryTitles.includes('Main Alpha One') || unidexEntryTitles.includes('Child Alpha One') || unidexEntryTitles.includes('Main Alpha Drift')) {
    throw new Error('Unidex entries leaked cross-workspace or drift links: ' + JSON.stringify(unidexEntryTitles));
  }

  return {
    mainDashboardTitles,
    childDashboardTitles,
    unidexCards,
    unidexEntryTitles
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
    await injectRawDrift(page);
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
