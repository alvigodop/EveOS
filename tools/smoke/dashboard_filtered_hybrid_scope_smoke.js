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

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'dashboard-filter-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'dashboard-filter-seed' });
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

async function runSmoke(page) {
  await page.waitForSelector('.category-card[data-card-category="Alpha"][data-card-workspace="main"]', { timeout: 15000 });
  await page.fill('#search', 'Drift');
  await page.evaluate(() => {
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  });

  await page.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('.category-card'));
    return cards.length > 0 && cards.every((card) => {
      const titleNode = card.querySelector('li a');
      return !titleNode || String(titleNode.textContent || '').includes('Drift');
    });
  }, undefined, { timeout: 15000 });

  const snapshot = await page.evaluate(() => {
    return {
      cardKeys: Array.from(document.querySelectorAll('.category-card')).map((card) => ({
        workspace: String(card.getAttribute('data-card-workspace') || '').trim(),
        category: String(card.getAttribute('data-card-category') || '').trim(),
        titles: Array.from(card.querySelectorAll('li a')).map((node) => String(node.textContent || '').trim()).filter(Boolean)
      })),
      searchValue: String(document.getElementById('search')?.value || '')
    };
  });

  if (snapshot.searchValue !== 'Drift') {
    throw new Error('Dashboard search input did not retain Drift query: ' + JSON.stringify(snapshot));
  }
  if (snapshot.cardKeys.length !== 1) {
    throw new Error('Filtered dashboard should show only one card for the drift hit: ' + JSON.stringify(snapshot));
  }
  const onlyCard = snapshot.cardKeys[0];
  if (onlyCard.workspace !== 'main' || onlyCard.category !== 'Alpha') {
    throw new Error('Filtered dashboard leaked wrong workspace/category card: ' + JSON.stringify(snapshot));
  }
  if (JSON.stringify(onlyCard.titles) !== JSON.stringify(['Main Alpha Drift'])) {
    throw new Error('Filtered dashboard should show only the live drift match: ' + JSON.stringify(snapshot));
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
