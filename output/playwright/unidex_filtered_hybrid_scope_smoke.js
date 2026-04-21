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
    && !!window.UnidexViewModules?.createCoreHelperState
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

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'unidex-filtered-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'unidex-filtered-seed' });
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
  const helperSnapshot = await page.evaluate(() => {
    const helperState = window.UnidexViewModules.createCoreHelperState({ state: {} });
    return {
      mainFilteredTitles: helperState.getWorkspaceLinks('main', 'Drift').map((link) => String(link?.title || '').trim()),
      childFilteredTitles: helperState.getWorkspaceLinks('child', 'Drift').map((link) => String(link?.title || '').trim()),
      allFilteredTitles: helperState.getAllWorkspaceLinks('Drift').map((link) => String(link?.title || '').trim())
    };
  });

  if (JSON.stringify(helperSnapshot.mainFilteredTitles) !== JSON.stringify(['Main Alpha Drift'])) {
    throw new Error('Main filtered helper path should preserve live-only drift match: ' + JSON.stringify(helperSnapshot));
  }
  if (helperSnapshot.childFilteredTitles.length !== 0) {
    throw new Error('Child filtered helper path leaked cross-workspace data: ' + JSON.stringify(helperSnapshot));
  }
  if (JSON.stringify(helperSnapshot.allFilteredTitles) !== JSON.stringify(['Main Alpha Drift'])) {
    throw new Error('All-tabs filtered helper path should preserve drift only once: ' + JSON.stringify(helperSnapshot));
  }

  await page.evaluate(() => {
    config.viewMode = 'unidex';
    if (window.eveState?.config) window.eveState.config.viewMode = 'unidex';
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  });
  await page.waitForSelector('.unidex-shell .unidex-tabs', { timeout: 15000 });

  await page.evaluate(() => window.UnidexView.switchWorkspaceTab('main'));
  await page.waitForSelector('.unidex-shell .unidex-cards', { timeout: 15000 });
  await page.evaluate(() => {
    const grid = document.getElementById('dashboard-grid');
    window.UnidexView.render(grid, { searchStr: 'Drift' });
  });

  const filteredCards = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.unidex-cards .unidex-card')).map((card) => ({
      title: String(card.querySelector('.unidex-card-title')?.textContent || '').trim(),
      total: String(card.querySelector('.unidex-card-pill')?.textContent || '').trim()
    }));
  });

  const alphaCard = filteredCards.find((card) => card.title === 'Alpha');
  if (!alphaCard || alphaCard.total !== '1' || filteredCards.length !== 1) {
    throw new Error('Filtered Unidex cards should show only the drift match in Main::Alpha: ' + JSON.stringify(filteredCards));
  }

  await page.evaluate(() => window.UnidexView.selectCategory('Alpha'));
  await page.waitForSelector('.unidex-shell .unidex-entries', { timeout: 15000 });
  await page.evaluate(() => {
    const grid = document.getElementById('dashboard-grid');
    window.UnidexView.render(grid, { searchStr: 'Drift' });
  });

  const filteredEntries = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.unidex-entry-title')).map((node) => String(node.textContent || '').trim()).filter(Boolean);
  });

  if (JSON.stringify(filteredEntries) !== JSON.stringify(['Main Alpha Drift'])) {
    throw new Error('Filtered Unidex entries should show only the drift match: ' + JSON.stringify(filteredEntries));
  }

  return {
    helperSnapshot,
    filteredCards,
    filteredEntries
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
