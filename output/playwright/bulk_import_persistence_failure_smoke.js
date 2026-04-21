const { chromium } = require('playwright');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForBoot(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.openBulkModal && window.EveBulkImport?._api?.processBulk), null, { timeout: 30000 });
  await page.waitForTimeout(9000);
}

async function openBulk(page) {
  await page.evaluate(() => window.openBulkModal());
  await page.waitForSelector('#bulkModal', { state: 'visible', timeout: 10000 });
}

async function clickImport(page) {
  await page.locator('#bulkModal .btn-primary').click();
  await page.waitForTimeout(1200);
}

async function runCardsFailureScenario(page) {
  const categoryPrefix = `BulkPersistCards_${Date.now()}`;
  await openBulk(page);

  const beforeLinks = await page.evaluate(() => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    return rawLinks.length;
  });

  await page.evaluate(({ categoryPrefix }) => {
    const api = window.EveBulkImport._api;
    document.getElementById('bulkModeCard').checked = true;
    api.updateBulkModeUi();

    const originalSaveLibrary = window.EveLibrary.Storage.saveLibrary;
    const originalSaveConnections = window.EveLibrary.ConnectionsCore.saveConnections;
    window.__bulkPersistProbe = { saveLibraryThrows: 0, saveConnectionsThrows: 0 };

    window.EveLibrary.Storage.saveLibrary = function () {
      window.__bulkPersistProbe.saveLibraryThrows += 1;
      throw new Error('forced saveLibrary failure');
    };
    window.EveLibrary.ConnectionsCore.saveConnections = function () {
      window.__bulkPersistProbe.saveConnectionsThrows += 1;
      throw new Error('forced saveConnections failure');
    };

    const buildFile = (relativePath, content) => {
      const file = new File(
        [content],
        relativePath.split('/').pop(),
        { type: 'text/plain', lastModified: 1776000000000 }
      );
      Object.defineProperty(file, 'customRelativePath', {
        value: relativePath,
        configurable: true
      });
      return file;
    };

    api._accumulatedFolderFiles = [
      buildFile(`RootA/${categoryPrefix}_One.txt`, '3'),
      buildFile(`RootB/${categoryPrefix}_Two.txt`, '4')
    ];
    api._latentCardMap = {
      RootA: `${categoryPrefix}_CardA`,
      RootB: `${categoryPrefix}_CardB`
    };
    api.updateBulkModeUi();

    window.__bulkPersistRestore = () => {
      window.EveLibrary.Storage.saveLibrary = originalSaveLibrary;
      window.EveLibrary.ConnectionsCore.saveConnections = originalSaveConnections;
    };
  }, { categoryPrefix });

  await clickImport(page);

  const result = await page.evaluate(({ categoryPrefix, beforeLinks }) => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    const created = rawLinks.slice(beforeLinks).filter((link) =>
      String(link?.category || '').startsWith(categoryPrefix)
    );
    const modalDisplay = window.getComputedStyle(document.getElementById('bulkModal')).display;
    const probe = window.__bulkPersistProbe || null;
    window.__bulkPersistRestore?.();
    return {
      modalDisplay,
      probe,
      createdCount: created.length
    };
  }, { categoryPrefix, beforeLinks });

  return result;
}

async function runSmartFailureScenario(page) {
  const categoryName = `BulkPersistSmart_${Date.now()}`;
  await openBulk(page);

  const beforeLinks = await page.evaluate(() => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    return rawLinks.length;
  });

  await page.evaluate(({ categoryName }) => {
    const api = window.EveBulkImport._api;
    document.getElementById('bulkModeFile').checked = true;
    api.updateBulkModeUi();

    const originalSaveLibrary = window.EveLibrary.Storage.saveLibrary;
    const originalSaveConnections = window.EveLibrary.ConnectionsCore.saveConnections;
    window.__bulkPersistProbe = { saveLibraryThrows: 0, saveConnectionsThrows: 0 };

    window.EveLibrary.Storage.saveLibrary = function () {
      window.__bulkPersistProbe.saveLibraryThrows += 1;
      throw new Error('forced saveLibrary failure');
    };
    window.EveLibrary.ConnectionsCore.saveConnections = function () {
      window.__bulkPersistProbe.saveConnectionsThrows += 1;
      throw new Error('forced saveConnections failure');
    };

    const categoryInput = document.getElementById('bulkCategory');
    if (categoryInput) {
      categoryInput.value = categoryName;
    }

    const dt = new DataTransfer();
    dt.items.add(new File(['3'], 'Smart Persist Entry.txt', { type: 'text/plain' }));
    const input = document.getElementById('bulkFileInput');
    input.files = dt.files;
    api.updateBulkModeUi();

    window.__bulkPersistRestore = () => {
      window.EveLibrary.Storage.saveLibrary = originalSaveLibrary;
      window.EveLibrary.ConnectionsCore.saveConnections = originalSaveConnections;
    };
  }, { categoryName });

  await clickImport(page);

  const result = await page.evaluate(({ categoryName, beforeLinks }) => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    const created = rawLinks.slice(beforeLinks).filter((link) => String(link?.category || '') === categoryName);
    const modalDisplay = window.getComputedStyle(document.getElementById('bulkModal')).display;
    const probe = window.__bulkPersistProbe || null;
    window.__bulkPersistRestore?.();
    return {
      modalDisplay,
      probe,
      createdCount: created.length,
      createdTitles: created.map((link) => link.title)
    };
  }, { categoryName, beforeLinks });

  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..', '..');
  const url = 'file:///' + path.resolve(repoRoot, 'EveOS.html').replace(/\\/g, '/');

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));

  await waitForBoot(page, url);
  const cards = await runCardsFailureScenario(page);
  const smart = await runSmartFailureScenario(page);
  const result = { cards, smart, pageErrors };

  console.log(JSON.stringify(result, null, 2));

  assert(cards.createdCount === 2, 'Cards import should still create links when library persistence throws');
  assert(cards.modalDisplay === 'none', 'Cards import modal should still close when library persistence throws');
  assert(cards.probe && cards.probe.saveLibraryThrows >= 1, 'Cards import did not exercise library save failure path');
  assert(cards.probe && cards.probe.saveConnectionsThrows >= 1, 'Cards import did not exercise connections save failure path');

  assert(smart.createdCount === 1, 'Smart Extract should still create its link when library persistence throws');
  assert(smart.createdTitles.includes('Smart Persist Entry'), 'Smart Extract created the wrong bookmark during persistence failure');
  assert(smart.modalDisplay === 'none', 'Smart Extract modal should still close when library persistence throws');
  assert(smart.probe && smart.probe.saveLibraryThrows >= 1, 'Smart Extract did not exercise library save failure path');
  assert(smart.probe && smart.probe.saveConnectionsThrows >= 1, 'Smart Extract did not exercise connections save failure path');

  await page.screenshot({ path: path.resolve(repoRoot, 'output/playwright/bulk_import_persistence_failure_smoke.png'), fullPage: false });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
