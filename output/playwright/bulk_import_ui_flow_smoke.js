const { chromium } = require('playwright');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForBoot(page) {
  await page.goto(page.__eveUrl, { waitUntil: 'load' });
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

async function runCardsScenario(page) {
  const categoryPrefix = `BulkCardsUi_${Date.now()}`;
  await openBulk(page);

  const before = await page.evaluate(() => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    return {
      linkCount: rawLinks.length,
      closeCalls: 0,
      processCalls: 0
    };
  });

  await page.evaluate(({ categoryPrefix }) => {
    const api = window.EveBulkImport._api;
    const bulkModeCard = document.getElementById('bulkModeCard');
    if (bulkModeCard) bulkModeCard.checked = true;
    api.updateBulkModeUi();

    const originalClose = window.closeModals;
    const originalProcess = window.processBulk;
    window.__bulkUiProbe = { closeCalls: 0, processCalls: 0, errors: [] };

    window.closeModals = function () {
      window.__bulkUiProbe.closeCalls += 1;
      return originalClose.apply(this, arguments);
    };
    window.processBulk = async function () {
      window.__bulkUiProbe.processCalls += 1;
      try {
        return await originalProcess.apply(this, arguments);
      } catch (error) {
        window.__bulkUiProbe.errors.push(String(error && error.stack || error));
        throw error;
      }
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
      buildFile(`RootA/${categoryPrefix}_One.txt`, 'https://example.com/a'),
      buildFile(`RootB/${categoryPrefix}_Two.txt`, 'https://example.com/b')
    ];
    api._latentCardMap = {
      RootA: `${categoryPrefix}_CardA`,
      RootB: `${categoryPrefix}_CardB`
    };
    api.updateBulkModeUi();
  }, { categoryPrefix });

  await clickImport(page);

  const after = await page.evaluate(({ categoryPrefix, beforeLinkCount }) => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);

    const created = rawLinks.slice(beforeLinkCount).filter((link) =>
      String(link?.category || '').startsWith(categoryPrefix)
    );

    return {
      modalDisplay: window.getComputedStyle(document.getElementById('bulkModal')).display,
      probe: window.__bulkUiProbe || null,
      createdCount: created.length,
      createdCategories: created.map((link) => link.category).sort()
    };
  }, { categoryPrefix, beforeLinkCount: before.linkCount });

  return after;
}

async function runSmartExtractScenario(page) {
  const categoryName = `BulkSmartUi_${Date.now()}`;
  await openBulk(page);

  const before = await page.evaluate(() => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    return { linkCount: rawLinks.length };
  });

  await page.evaluate(({ categoryName }) => {
    const api = window.EveBulkImport._api;
    const modeFile = document.getElementById('bulkModeFile');
    if (modeFile) modeFile.checked = true;
    api.updateBulkModeUi();

    const categoryInput = document.getElementById('bulkCategory');
    if (categoryInput) {
      categoryInput.value = categoryName;
    }

    const dt = new DataTransfer();
    dt.items.add(new File(['Alpha Entry\nhttps://example.com/alpha'], 'Alpha Entry.txt', { type: 'text/plain' }));
    dt.items.add(new File(['Beta Entry\nhttps://example.com/beta'], 'Beta Entry.txt', { type: 'text/plain' }));

    const input = document.getElementById('bulkFileInput');
    input.files = dt.files;
    api.updateBulkModeUi();
  }, { categoryName });

  await clickImport(page);

  const after = await page.evaluate(({ categoryName, beforeLinkCount }) => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);

    const created = rawLinks.slice(beforeLinkCount).filter((link) => String(link?.category || '') === categoryName);

    return {
      modalDisplay: window.getComputedStyle(document.getElementById('bulkModal')).display,
      createdCount: created.length,
      createdTitles: created.map((link) => link.title).sort()
    };
  }, { categoryName, beforeLinkCount: before.linkCount });

  return after;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..', '..');
  page.__eveUrl = 'file:///' + path.resolve(repoRoot, 'EveOS.html').replace(/\\/g, '/');

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack || error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await waitForBoot(page);
  const cards = await runCardsScenario(page);
  const smart = await runSmartExtractScenario(page);

  const result = { cards, smart, pageErrors, consoleErrors };
  console.log(JSON.stringify(result, null, 2));

  assert(cards.probe && cards.probe.processCalls === 1, 'Cards mode import button did not trigger processBulk exactly once');
  assert(cards.probe && cards.probe.closeCalls >= 1, 'Cards mode did not call closeModals');
  assert(cards.createdCount === 2, 'Cards mode UI click did not create both card bookmarks');
  assert(cards.modalDisplay === 'none', `Cards mode modal stayed open after import: ${cards.modalDisplay}`);

  assert(smart.createdCount >= 2, 'Smart Extract UI click did not create bookmarks in target card');
  assert(smart.createdTitles.includes('Alpha Entry') && smart.createdTitles.includes('Beta Entry'), 'Smart Extract UI click created wrong bookmarks');
  assert(smart.modalDisplay === 'none', `Smart Extract modal stayed open after import: ${smart.modalDisplay}`);

  await page.screenshot({ path: path.resolve(repoRoot, 'output/playwright/bulk_import_ui_flow_smoke.png'), fullPage: false });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
