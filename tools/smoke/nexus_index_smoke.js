const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
  const now = Date.now();
  return {
    links: [
      { id: 'alpha-root', title: 'Alpha Test Bookmark', url: 'https://example.com/alpha', workspace: 'main', category: 'Alpha', done: false },
      { id: 'alpha-folder-link', title: 'Alpha Folder Bookmark', url: 'https://example.com/alpha-folder', workspace: 'main', category: 'Alpha', folderId: 'alpha-folder', done: false },
      { id: 'beta-hidden', title: 'Beta Hidden Bookmark', url: 'https://example.com/beta-hidden', workspace: 'alt', category: 'Beta', done: false }
    ],
    config: {
      activeWorkspace: 'main',
      viewMode: 'grid',
      showInactiveTabs: false,
      showHiddenSidebarGroups: false,
      workspaces: [
        { id: 'main', name: 'Main', icon: 'folder' },
        { id: 'alt', name: 'Alt', icon: 'folder' }
      ],
      categoryOrder: ['Alpha', 'Beta', 'Gamma'],
      cardFolderViewModes: { 'main::Alpha': true }
    },
    bookmarkFolders: {
      'main::Alpha': {
        nodes: [
          { id: 'alpha-folder', parentId: null, name: 'Research', order: 0 }
        ]
      }
    },
    libraries: {
      'main::Alpha': {
        dataType: 'graphicNovels',
        entries: [
          {
            id: 'lib-alpha-1',
            title: 'Alpha Library Entry',
            summary: 'Linked alpha library summary',
            status: 'Reading',
            author: 'Nova',
            genre: 'Test',
            dateAdded: now,
            lastEdited: now
          }
        ]
      },
      'alt::Gamma': {
        dataType: 'graphicNovels',
        entries: [
          {
            id: 'lib-gamma-1',
            title: 'Gamma Library Entry',
            summary: 'Standalone gamma library summary',
            status: 'Completed',
            author: 'Nova',
            genre: 'Archive',
            dateAdded: now,
            lastEdited: now
          }
        ]
      }
    }
  };
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.renderDashboard === 'function'
    && typeof window.renderSidebar === 'function'
    && typeof window.openExpandedSearchModal === 'function'
    && typeof window.SearchMonitorBoot?.expand === 'function'
    && !!window.EveOS?.SearchAdvanced?.SearchVectors
    && !!window.EveOS?.SearchAdvanced?.Navigation
    && !!window.EveOS?.SearchAdvanced?.Index
    && !!window.EveOS?.API?.SearchInternals?.saveScopedStorageValueAsync
    && !!window.EveOS?.API?.Cache?.storeQuery
    && !!window.EveLibrary?.State?.setAllLibraries
  ), undefined, { timeout: 120000 });
}

async function seedState(page, seed) {
  await page.evaluate(async (payload) => {
    config = JSON.parse(JSON.stringify(payload.config));
    links = JSON.parse(JSON.stringify(payload.links));
    bookmarkFolders = JSON.parse(JSON.stringify(payload.bookmarkFolders || {}));
    window.config = config;
    window.links = links;
    window.bookmarkFolders = bookmarkFolders;
    if (window.eveState) {
      window.eveState.config = config;
      window.eveState.links = links;
      window.eveState.bookmarkFolders = bookmarkFolders;
    }

    try {
      localStorage.removeItem('eve.nexusIndex.v1');
      localStorage.removeItem('eve.nexusIndex.v2');
      localStorage.setItem('eveV22Data', JSON.stringify(links));
      localStorage.setItem('eveV22Config', JSON.stringify(config));
      localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(bookmarkFolders));
    } catch (error) {
      // file:// can reject localStorage in some runs
    }

    window.EveLibrary.State.setAllLibraries(JSON.parse(JSON.stringify(payload.libraries || {})));
    await window.EveOS.API.SearchInternals.saveScopedStorageValueAsync('wikiEntries', [
      { title: 'Alpha Test Article', name: 'Alpha Test Article' }
    ], 'Alpha');
    await window.EveOS.API.SearchInternals.saveScopedStorageValueAsync('fandomDomains', [
      { domain: 'alpha-test.fandom.com', name: 'Alpha Test Wiki' }
    ], 'Alpha');
    await window.EveOS.API.Cache.storeQuery('Alpha Test', {
      mangadex: {
        data: [
          { id: 'md-alpha', attributes: { title: { en: 'Alpha Cached Result' } } }
        ]
      }
    }, 'Alpha');

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'seed-state' } }));
    if (typeof window.renderSidebar === 'function') window.renderSidebar();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
  }, seed);
}

async function openNexusFromMonitor(page) {
  await page.locator('#loadingIndicator .monitor-nexus-toggle').click();
  await page.waitForFunction(() => {
    const modal = document.getElementById('expandedSearchModal');
    return !!modal && modal.style.display === 'flex';
  }, undefined, { timeout: 10000 });
}

async function runSearch(page, query) {
  await page.fill('#esQuery', query);
  await page.locator('#esRunBtn').click();
}

async function waitForText(page, selector, text) {
  await page.waitForFunction(({ selector, text }) => {
    return Array.from(document.querySelectorAll(selector)).some((node) => {
      return String(node.textContent || '').includes(text);
    });
  }, { selector, text }, { timeout: 15000 });
}

async function collectGroupTitles(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#esResults .nx-group-title')).map((node) => String(node.textContent || '').trim()));
}

async function runSmoke(page) {
  await page.evaluate(() => window.SearchMonitorBoot.expand());
  await page.waitForSelector('#loadingIndicator:not(.compact) .monitor-nexus-toggle', { timeout: 10000 });
  await page.waitForSelector('#loadingIndicator #nexusTraceRow', { timeout: 10000 });

  const launcherText = await page.locator('#loadingIndicator .monitor-nexus-toggle').textContent();
  if (String(launcherText || '').trim() !== 'Nexus') {
    throw new Error('Search Monitor Nexus launcher missing or mislabeled');
  }

  await openNexusFromMonitor(page);

  const modeState = await page.evaluate(() => ({
    segmentedActive: !!document.querySelector('.nx-mode-btn[data-results-mode="segmented"]')?.classList.contains('nx-mode-btn-active'),
    mergedActive: !!document.querySelector('.nx-mode-btn[data-results-mode="merged"]')?.classList.contains('nx-mode-btn-active'),
    currentScopeActive: !!document.querySelector('.nx-mode-btn[data-scope-mode="current"]')?.classList.contains('nx-mode-btn-active'),
    allScopeActive: !!document.querySelector('.nx-mode-btn[data-scope-mode="all"]')?.classList.contains('nx-mode-btn-active'),
    scopeText: document.getElementById('esScopeIndicator')?.textContent || ''
  }));
  if (!modeState.segmentedActive || modeState.mergedActive) {
    throw new Error('Segmented mode should be the default results mode');
  }
  if (!modeState.currentScopeActive || modeState.allScopeActive) {
    throw new Error('Current scope should be the default Nexus scope: ' + JSON.stringify(modeState));
  }
  if (String(modeState.scopeText).includes('All Tabs')) {
    throw new Error('Search Monitor launcher should open Nexus in current scope first: ' + JSON.stringify(modeState));
  }

  await page.locator('.nx-mode-btn[data-scope-mode="all"]').click();
  await page.waitForFunction(() => {
    return !!document.querySelector('.nx-mode-btn[data-scope-mode="all"]')?.classList.contains('nx-mode-btn-active')
      && String(document.getElementById('esScopeIndicator')?.textContent || '').includes('All Tabs');
  }, undefined, { timeout: 10000 });

  await page.fill('#esQuery', 'Alpha T');
  await page.waitForFunction(() => {
    const panel = document.getElementById('nxTypeahead');
    return !!panel && !panel.hidden && !!panel.querySelector('.nx-typeahead-item');
  }, undefined, { timeout: 10000 });
  if (await page.locator('#nxTypeahead .nx-typeahead-item-active').count()) {
    throw new Error('Record typeahead should not preselect a completion.');
  }
  await page.press('#esQuery', 'Enter');
  await waitForText(page, '#esResults .nx-result-item', 'Alpha Test Bookmark');
  if (await page.inputValue('#esQuery') !== 'Alpha T') {
    throw new Error('Enter replaced the typed query with an autocomplete result.');
  }

  await page.fill('#esQuery', 'Alpha T');
  await page.waitForFunction(() => {
    const panel = document.getElementById('nxTypeahead');
    return !!panel && !panel.hidden && !!panel.querySelector('.nx-typeahead-item');
  }, undefined, { timeout: 10000 });
  const suggestionTitle = String(await page.locator('#nxTypeahead .nx-typeahead-title').first().textContent() || '').trim();
  await page.locator('#nxTypeahead .nx-typeahead-item').first().dispatchEvent('mousedown');
  if (!suggestionTitle || await page.inputValue('#esQuery') !== suggestionTitle) {
    throw new Error('Clicking a typeahead result did not intentionally fill the query.');
  }

  await runSearch(page, 'Alpha');
  await waitForText(page, '#esResults .nx-result-item', 'Alpha Test Bookmark');
  await waitForText(page, '#esResults .nx-result-item', 'Alpha Library Entry');

  const alphaSummary = await page.evaluate(() => {
    const trace = document.querySelector('#loadingIndicator #nexusTrace')?.textContent || '';
    const groups = Array.from(document.querySelectorAll('#esResults .nx-group-title')).map((node) => String(node.textContent || '').trim());
    const bookmarkItem = Array.from(document.querySelectorAll('#esResults .nx-result-item')).find((node) => String(node.textContent || '').includes('Alpha Folder Bookmark'));
    return {
      groups,
      allCollapsed: Array.from(document.querySelectorAll('#esResults .nx-result-group')).every((node) => node.classList.contains('collapsed')),
      allAriaCollapsed: Array.from(document.querySelectorAll('#esResults [data-nx-collapse-group]')).every((node) => node.getAttribute('aria-expanded') === 'false'),
      hasTraceButton: !!document.querySelector('#esResults [data-nx-action="trace"]'),
      hasVisibilityButton: !!bookmarkItem?.querySelector('[data-nx-action="visibility"]'),
      hasProvenanceButton: !!bookmarkItem?.querySelector('[data-nx-action="provenance"]'),
      trace
    };
  });

  ['Cards', 'Bookmarks', 'Library Entries', 'Knowledge & Source Graph', 'Cached API Results'].forEach((group) => {
    if (!alphaSummary.groups.includes(group)) {
      throw new Error('Expected result group missing: ' + group + ' | got ' + JSON.stringify(alphaSummary.groups));
    }
  });
  if (!alphaSummary.hasTraceButton || !alphaSummary.hasVisibilityButton || !alphaSummary.hasProvenanceButton) {
    throw new Error('Expected result trace/debug actions are missing');
  }
  if (!alphaSummary.allCollapsed || !alphaSummary.allAriaCollapsed) {
    throw new Error('Nexus result groups should start collapsed: ' + JSON.stringify(alphaSummary));
  }
  if (!String(alphaSummary.trace).includes('NX-')) {
    throw new Error('Search Monitor trace did not update for Nexus search: ' + alphaSummary.trace);
  }

  await page.evaluate(() => {
    document.querySelectorAll('#esResults [data-nx-collapse-group]').forEach((header) => header.click());
  });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#esResults .nx-result-group')).every((node) => !node.classList.contains('collapsed')));
  await page.locator('#esResults [data-nx-action="trace"]').first().click();
  await page.waitForFunction(() => {
    const details = document.querySelector('#loadingIndicator #nexusTraceDetails');
    return !!details
      && !details.hasAttribute('hidden')
      && String(details.textContent || '').includes('Scope')
      && String(details.textContent || '').includes('Local');
  }, undefined, { timeout: 10000 });
  await page.evaluate(() => window.SearchMonitorBoot.collapse());

  await page.locator('.nx-mode-btn[data-results-mode="merged"]').click();
  await page.waitForFunction(() => {
    const titles = Array.from(document.querySelectorAll('#esResults .nx-group-title')).map((node) => String(node.textContent || '').trim());
    return titles.length === 1
      && titles[0] === 'Merged Results'
      && !!document.querySelector('#esResults .nx-result-group-merged.collapsed')
      && document.querySelector('#esResults .nx-result-group-merged [data-nx-collapse-group]')?.getAttribute('aria-expanded') === 'false'
      && !!document.querySelector('.nx-mode-btn[data-results-mode="merged"]')?.classList.contains('nx-mode-btn-active');
  }, undefined, { timeout: 10000 });

  await page.locator('.nx-mode-btn[data-results-mode="segmented"]').click();
  await page.waitForFunction(() => {
    return document.querySelectorAll('#esResults .nx-group-title').length > 0
      && !!document.querySelector('.nx-mode-btn[data-results-mode="segmented"]')?.classList.contains('nx-mode-btn-active');
  }, undefined, { timeout: 10000 });

  await runSearch(page, 'Beta');
  await waitForText(page, '#esResults .nx-result-item', 'Beta Hidden Bookmark');
  await page.evaluate(() => {
    const header = Array.from(document.querySelectorAll('#esResults [data-nx-collapse-group]'))
      .find((node) => String(node.textContent || '').includes('Bookmarks'));
    if (header) header.click();
  });
  const betaResult = page.locator('#esResults .nx-result-item', { hasText: 'Beta Hidden Bookmark' }).first();
  const visibilityButtonText = await betaResult.locator('[data-nx-action="visibility"]').textContent();
  if (!String(visibilityButtonText || '').includes('Why Not Visible')) {
    throw new Error('Hidden result should expose Why Not Visible? action');
  }
  await betaResult.locator('[data-nx-action="visibility"]').click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('#esResults .nx-result-item .nx-result-provenance[data-nx-panel="visibility"]:not([hidden])');
    return !!panel && String(panel.textContent || '').includes('Lives in another tab');
  }, undefined, { timeout: 10000 });

  await runSearch(page, '> inspect source Beta');
  await waitForText(page, '#esResults', 'Source Inspection');
  await waitForText(page, '#esResults', 'Lives in another tab');

  await runSearch(page, '> reindex nexus');
  await waitForText(page, '#esResults', 'Nexus index rebuilt');
  const reindexTrace = await page.locator('#loadingIndicator #nexusTrace').textContent();
  if (!String(reindexTrace || '').includes('CMD-')) {
    throw new Error('Command trace did not reach Search Monitor: ' + reindexTrace);
  }

  await page.evaluate(async () => {
    await window.EveOS.API.SearchInternals.saveScopedStorageValueAsync('wikiEntries', [
      { title: 'Alpha Test Article', name: 'Alpha Test Article' },
      { title: 'Deep Delta Alpha Reference', name: 'Deep Delta Alpha Reference' }
    ], 'Alpha');
  });
  await runSearch(page, 'Deep Delta');
  await waitForText(page, '#esResults .nx-result-item', 'Deep Delta Alpha Reference');

  await page.evaluate(async () => {
    await window.EveOS.API.Cache.storeQuery('Omega Query', {
      mangadex: {
        data: [
          { id: 'md-omega', attributes: { title: { en: 'Omega Cached Result' } } }
        ]
      }
    }, 'Alpha');
  });
  await runSearch(page, 'Omega Cached');
  await waitForText(page, '#esResults .nx-result-item', 'Omega Cached Result');

  await runSearch(page, 'Gamma');
  await waitForText(page, '#esResults .nx-result-item', 'Gamma Library Entry');
  const gammaGroups = await collectGroupTitles(page);
  if (!gammaGroups.includes('Cards') || !gammaGroups.includes('Library Entries')) {
    throw new Error('Library-only category should surface both card and library groups: ' + JSON.stringify(gammaGroups));
  }

  await page.evaluate(() => window.closeModals?.());
  await page.waitForFunction(() => {
    const modal = document.getElementById('expandedSearchModal');
    return !!modal && modal.style.display === 'none';
  }, undefined, { timeout: 10000 });
  await page.keyboard.press('Control+Shift+K');
  await page.waitForFunction(() => {
    const modal = document.getElementById('expandedSearchModal');
    return !!modal && modal.style.display === 'flex';
  }, undefined, { timeout: 10000 });
  const reopenedScopeState = await page.evaluate(() => ({
    currentScopeActive: !!document.querySelector('.nx-mode-btn[data-scope-mode="current"]')?.classList.contains('nx-mode-btn-active'),
    scopeText: document.getElementById('esScopeIndicator')?.textContent || ''
  }));
  if (!reopenedScopeState.currentScopeActive || String(reopenedScopeState.scopeText).includes('All Tabs')) {
    throw new Error('Ctrl+Shift+K should reopen Nexus in current scope: ' + JSON.stringify(reopenedScopeState));
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
  const screenshotPath = path.join(REPO_ROOT, 'output', 'playwright', 'nexus_index_smoke.png');

  try {
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitForApp(page);
    await seedState(page, buildSeedPayload());
    await runSmoke(page);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({
      ok: true,
      screenshotPath
    }, null, 2));
  } finally {
    await browser.close();
  }
})();
