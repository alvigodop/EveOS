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

async function waitForHydratedCardLinks(page, selector, expectedTitle, label) {
  await page.waitForSelector(selector, { timeout: 15000 });
  const card = page.locator(selector).first();
  const before = await card.evaluate((node) => ({
    deferred: node.getAttribute('data-card-deferred') === '1',
    onDemand: node.getAttribute('data-card-hydrate-on-demand') === '1',
    hydrating: node.getAttribute('data-card-hydrating') === '1'
  }));
  if (before.deferred && before.onDemand) {
    await card.hover();
  }

  try {
    await page.waitForFunction(({ selector, expectedTitle }) => {
      const node = document.querySelector(selector);
      if (!node || node.getAttribute('data-card-deferred') === '1') return false;
      const titles = Array.from(node.querySelectorAll('li a'))
        .map((anchor) => String(anchor.textContent || '').trim())
        .filter(Boolean);
      return titles.includes(expectedTitle);
    }, { selector, expectedTitle }, { timeout: 15000 });
  } catch (error) {
    const diagnostics = await page.evaluate(({ selector }) => {
      const node = document.querySelector(selector);
      const workspaceId = String(node?.getAttribute('data-card-workspace') || '').trim();
      const categoryName = String(node?.getAttribute('data-card-category') || '').trim();
      const liveLinks = typeof window.getLiveLinks === 'function'
        ? window.getLiveLinks()
        : (Array.isArray(window.links) ? window.links : []);
      return {
        activeWorkspace: String(window.config?.activeWorkspace || ''),
        cardExists: !!node,
        deferred: node?.getAttribute('data-card-deferred') === '1',
        onDemand: node?.getAttribute('data-card-hydrate-on-demand') === '1',
        hydrating: node?.getAttribute('data-card-hydrating') === '1',
        anchorTitles: Array.from(node?.querySelectorAll('li a') || [])
          .map((anchor) => String(anchor.textContent || '').trim())
          .filter(Boolean),
        scopedLinks: liveLinks
          .filter((link) => (
            String(link?.workspace || 'main').trim() === workspaceId
            && String(link?.category || 'Unsorted').trim() === categoryName
          ))
          .map((link) => ({
            id: String(link?.id || ''),
            title: String(link?.title || ''),
            workspace: String(link?.workspace || ''),
            category: String(link?.category || '')
          }))
      };
    }, { selector });
    throw new Error(label + ' did not hydrate expected bookmark: ' + JSON.stringify(diagnostics));
  }

  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return Array.from(node?.querySelectorAll('li a') || [])
      .map((anchor) => String(anchor.textContent || '').trim())
      .filter(Boolean);
  }, selector);
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
    await window.EveOS.DatapackIndex.ensureFresh({
      reason: 'exact-scope-seed',
      force: true,
      forceFull: true
    });
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

async function collectUnidexScopeDiagnostics(page) {
  return page.evaluate(() => {
    const indexApi = window.EveOS?.DatapackIndex || null;
    const liveLinks = typeof window.getLiveLinks === 'function'
      ? window.getLiveLinks()
      : (Array.isArray(window.eveState?.links)
        ? window.eveState.links
        : (Array.isArray(window.links) ? window.links : []));
    const targetIds = new Set(['main-alpha-1', 'child-alpha-1', 'main-alpha-drift']);
    const compactLink = (link) => ({
      id: String(link?.id || ''),
      title: String(link?.title || ''),
      workspace: String(link?.workspace || ''),
      category: String(link?.category || '')
    });
    const snapshotRecords = Array.isArray(indexApi?.getSnapshot?.()?.records)
      ? indexApi.getSnapshot().records
          .filter((record) => targetIds.has(String(record?.linkId || record?.id || '')))
          .map((record) => ({
            linkId: String(record?.linkId || record?.id || ''),
            title: String(record?.title || ''),
            workspaceId: String(record?.workspaceId || ''),
            categoryName: String(record?.categoryName || '')
          }))
      : [];

    return {
      activeWorkspace: String(window.config?.activeWorkspace || ''),
      buildState: typeof indexApi?.getBuildState === 'function' ? indexApi.getBuildState() : null,
      hasUsableSnapshot: typeof indexApi?.hasUsableSnapshot === 'function' ? indexApi.hasUsableSnapshot() : null,
      hasReadableLinkSnapshot: typeof indexApi?.hasReadableLinkSnapshot === 'function' ? indexApi.hasReadableLinkSnapshot() : null,
      hasReadableStructureSnapshot: typeof indexApi?.hasReadableStructureSnapshot === 'function' ? indexApi.hasReadableStructureSnapshot() : null,
      exactMainIds: typeof indexApi?.getExactBookmarkLinkIds === 'function'
        ? indexApi.getExactBookmarkLinkIds({ workspaceId: 'main' })
        : null,
      exactMainAlphaIds: typeof indexApi?.getExactBookmarkLinkIds === 'function'
        ? indexApi.getExactBookmarkLinkIds({ workspaceId: 'main', categoryName: 'Alpha' })
        : null,
      scopedMainIds: typeof indexApi?.getScopedBookmarkLinkIds === 'function'
        ? indexApi.getScopedBookmarkLinkIds({ workspaceId: 'main' })
        : null,
      mainAlphaSummary: typeof indexApi?.getCardSummary === 'function'
        ? indexApi.getCardSummary('main', 'Alpha')
        : null,
      liveTargetLinks: liveLinks.filter((link) => targetIds.has(String(link?.id || ''))).map(compactLink),
      snapshotTargetRecords: snapshotRecords
    };
  });
}

async function runSmoke(page) {
  const mainDashboardTitles = await waitForHydratedCardLinks(
    page,
    '.category-card[data-card-category="Alpha"][data-card-workspace="main"]',
    'Main Alpha One',
    'Exact-scope main Alpha card'
  );
  const childDashboardTitles = await waitForHydratedCardLinks(
    page,
    '.category-card[data-card-category="Alpha"][data-card-workspace="child"]',
    'Child Alpha One',
    'Exact-scope child Alpha card'
  );

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
    const diagnostics = await collectUnidexScopeDiagnostics(page);
    throw new Error('Unidex main Alpha card should stay exact-scoped at 1 bookmark: ' + JSON.stringify({
      unidexCards,
      diagnostics
    }));
  }

  await page.locator('.unidex-card-hit', { hasText: 'Alpha' }).first().click();
  await page.waitForSelector('.unidex-shell .unidex-entries', { timeout: 15000 });

  const unidexEntryTitles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.unidex-entry-title')).map((node) => String(node.textContent || '').trim()).filter(Boolean);
  });

  if (!unidexEntryTitles.includes('Main Alpha One') || unidexEntryTitles.includes('Child Alpha One') || unidexEntryTitles.includes('Main Alpha Drift')) {
    const diagnostics = await collectUnidexScopeDiagnostics(page);
    throw new Error('Unidex entries leaked cross-workspace or drift links: ' + JSON.stringify({
      unidexEntryTitles,
      diagnostics
    }));
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
