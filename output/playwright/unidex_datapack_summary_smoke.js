const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'alpha-1', title: 'Alpha One', url: 'https://example.com/alpha-1', workspace: 'main', category: 'Alpha', done: true },
      { id: 'alpha-2', title: 'Alpha Two', url: 'https://example.com/alpha-2', workspace: 'main', category: 'Alpha', done: false },
      { id: 'beta-1', title: 'Beta One', url: 'https://example.com/beta-1', workspace: 'child', category: 'Beta', done: false }
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
      categoryOrder: ['Alpha', 'Beta', 'Gamma'],
      hideStats: []
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && !!window.UnidexView
    && !!window.EveOS?.DatapackIndex
  ), undefined, { timeout: 120000 });
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

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'unidex-summary-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'unidex-summary-seed' });
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function injectRawDrift(page) {
  await page.evaluate(() => {
    const driftLink = {
      id: 'gamma-drift',
      title: 'Gamma Drift',
      url: 'https://example.com/gamma-drift',
      workspace: 'main',
      category: 'Gamma',
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
  await page.waitForSelector('.unidex-shell .unidex-tabs', { timeout: 15000 });

  const tabsStage = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.unidex-tab-btn')).map((button) => ({
      text: String(button.querySelector('.unidex-tab-main')?.textContent || '').trim(),
      count: String(button.querySelector('.unidex-tab-count')?.textContent || '').trim()
    }));
  });

  const mainTab = tabsStage.find((entry) => entry.text.includes('Main'));
  const childTab = tabsStage.find((entry) => entry.text.includes('Child'));
  if (!mainTab || mainTab.count !== '2 links') {
    throw new Error('Main tab count should stay pinned to indexed datapack count: ' + JSON.stringify(tabsStage));
  }
  if (!childTab || childTab.count !== '1 links') {
    throw new Error('Child tab count should stay pinned to indexed datapack count: ' + JSON.stringify(tabsStage));
  }

  await page.locator('.unidex-tab-btn', { hasText: 'Main' }).first().click();
  await page.waitForSelector('.unidex-shell .unidex-cards', { timeout: 15000 });

  const cardsStage = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.unidex-cards .unidex-card')).map((card) => ({
      title: String(card.querySelector('.unidex-card-title')?.textContent || '').trim(),
      total: String(card.querySelector('.unidex-card-pill')?.textContent || '').trim(),
      meta: String(card.querySelector('.unidex-card-meta')?.textContent || '').trim()
    }));
    const subtabCounts = Array.from(document.querySelectorAll('.unidex-subtab-section-header .unidex-subtab-count')).map((node) => String(node.textContent || '').trim());
    return { cards, subtabCounts };
  });

  const alphaCard = cardsStage.cards.find((card) => card.title === 'Alpha');
  const gammaCard = cardsStage.cards.find((card) => card.title === 'Gamma');
  if (!alphaCard || alphaCard.total !== '2' || alphaCard.meta !== 'Done: 1 | Pending: 1') {
    throw new Error('Alpha card should reflect indexed bookmark and done counts: ' + JSON.stringify(cardsStage));
  }
  if (gammaCard) {
    throw new Error('Gamma drift card should not appear without reindexing: ' + JSON.stringify(cardsStage));
  }
  if (!cardsStage.subtabCounts.includes('1 links')) {
    throw new Error('Child subtab section should reflect indexed count: ' + JSON.stringify(cardsStage));
  }

  return { tabsStage, cardsStage };
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
