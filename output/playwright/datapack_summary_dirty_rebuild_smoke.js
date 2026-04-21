const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  return {
    links: [
      { id: 'alpha-1', title: 'Alpha One', url: 'https://example.com/alpha-1', workspace: 'main', category: 'Alpha', done: false },
      { id: 'beta-1', title: 'Beta One', url: 'https://example.com/beta-1', workspace: 'main', category: 'Beta', done: false }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      showInactiveTabs: true,
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder', subTabs: [] }
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

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'dirty-rebuild-seed' } }));
    await window.EveOS.DatapackIndex.rebuild({ reason: 'dirty-rebuild-seed' });
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function mutateAndDirty(page) {
  return page.evaluate(() => {
    const driftLink = {
      id: 'gamma-1',
      title: 'Gamma One',
      url: 'https://example.com/gamma-1',
      workspace: 'main',
      category: 'Gamma',
      done: false
    };
    const nextLinks = Array.isArray(window.links) ? window.links.slice() : [];
    nextLinks.push(driftLink);
    links = nextLinks;
    window.links = nextLinks;
    if (window.eveState) window.eveState.links = nextLinks;
    try {
      localStorage.setItem('eveV22Data', JSON.stringify(nextLinks));
    } catch (error) {
      // file:// can reject localStorage writes
    }
    if (typeof window.saveData === 'function') {
      try {
        window.saveData();
      } catch (error) {
        // best-effort persistence for smoke realism
      }
    }
    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'dirty-rebuild-drift' } }));
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
    return typeof window.EveOS?.DatapackIndex?.getBuildState === 'function'
      ? window.EveOS.DatapackIndex.getBuildState()
      : null;
  });
}

async function runSmoke(page) {
  await page.waitForSelector('#dashboard-grid .category-card', { timeout: 15000 });

  const initialCards = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#dashboard-grid .category-card')).map((card) => {
      const titleNode = card.querySelector('.category-title-text, .category-title, h2, h3');
      return String(titleNode?.textContent || '').trim();
    }).filter(Boolean);
  });

  if (!initialCards.includes('Alpha') || !initialCards.includes('Beta') || initialCards.includes('Gamma')) {
    throw new Error('Initial seeded dashboard cards incorrect: ' + JSON.stringify(initialCards));
  }

  const dirtyState = await mutateAndDirty(page);
  if (!dirtyState?.dirty) {
    throw new Error('Datapack index should be dirty immediately after mutation: ' + JSON.stringify(dirtyState));
  }

  await page.waitForFunction(() => {
    return !!window.EveOS?.DatapackIndex?.hasUsableSnapshot?.();
  }, undefined, { timeout: 15000 });

  await page.waitForTimeout(500);

  const finalState = await page.evaluate(async () => {
    const buildState = window.EveOS?.DatapackIndex?.getBuildState?.() || null;
    const summary = window.EveOS?.DatapackIndex?.getStructureSummary?.() || null;
    const liveLinkIds = (Array.isArray(window.eveState?.links) ? window.eveState.links : []).map((link) => String(link?.id || ''));
    const snapshotProbe = window.EveOS?.SearchAdvanced?.IndexRecordBuildersSources?.buildSnapshot
      ? await window.EveOS.SearchAdvanced.IndexRecordBuildersSources.buildSnapshot('dirty-rebuild-probe')
      : null;
    const cards = Array.from(document.querySelectorAll('#dashboard-grid .category-card')).map((card) => {
      const titleNode = card.querySelector('.category-title-text, .category-title, h2, h3');
      return String(titleNode?.textContent || '').trim();
    }).filter(Boolean);
    return {
      buildState,
      cards,
      summaryKeys: Object.keys(summary?.cards || {}),
      liveLinkIds,
      probeCardTitles: (snapshotProbe?.records || []).filter((record) => record?.type === 'card').map((record) => String(record?.title || ''))
    };
  });

  if (finalState.buildState?.dirty) {
    throw new Error('Datapack index should have rebuilt back to a usable snapshot: ' + JSON.stringify(finalState));
  }
  if (!finalState.liveLinkIds.includes('gamma-1')) {
    throw new Error('Live state lost the mutated link before rebuild: ' + JSON.stringify(finalState));
  }
  if (!finalState.probeCardTitles.includes('Gamma')) {
    throw new Error('Direct snapshot builder should see Gamma after mutation: ' + JSON.stringify(finalState));
  }
  if (!finalState.summaryKeys.some((key) => key === 'main::Gamma')) {
    throw new Error('Datapack summary should include Gamma after dirty rebuild: ' + JSON.stringify(finalState));
  }
  if (!finalState.cards.includes('Gamma')) {
    throw new Error('Dashboard should reflect rebuilt datapack summary after mutation: ' + JSON.stringify(finalState));
  }

  return { initialCards, dirtyState, finalState };
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
