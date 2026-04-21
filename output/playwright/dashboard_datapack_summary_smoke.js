const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'alpha-1', title: 'Alpha One', url: 'https://example.com/alpha-1', workspace: 'main', category: 'Alpha', done: false },
      { id: 'beta-1', title: 'Beta One', url: 'https://example.com/beta-1', workspace: 'child', category: 'Beta', done: false }
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
      categoryOrder: ['Alpha', 'Beta', 'Gamma'],
      hideStats: []
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && !!window.EveOS?.DatapackIndex
    && !!window.renderCategories
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

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'dashboard-summary-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'dashboard-summary-seed' });
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
  await page.waitForSelector('#dashboard-grid .category-card', { timeout: 15000 });

  const cards = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#dashboard-grid .category-card')).map((card) => {
      const titleNode = card.querySelector('.category-title-text, .category-title, h2, h3');
      return String(titleNode?.textContent || '').trim();
    }).filter(Boolean);
  });

  if (!cards.includes('Alpha') || !cards.includes('Beta')) {
    throw new Error('Expected indexed dashboard cards missing: ' + JSON.stringify(cards));
  }
  if (cards.includes('Gamma')) {
    throw new Error('Gamma drift card should not appear before reindexing: ' + JSON.stringify(cards));
  }

  return { cards };
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
