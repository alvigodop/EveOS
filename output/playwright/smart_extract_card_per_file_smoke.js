const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => pageErrors.push(String(error && error.stack ? error.stack : error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const repoRoot = path.resolve(__dirname, '..', '..');
  const tmpDir = path.join(repoRoot, 'output', 'playwright', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const fileOne = path.join(tmpDir, 'Sample Series One_260227_215805.txt');
  const fileTwo = path.join(tmpDir, 'Sample Series Two_260227_215806.txt');
  fs.writeFileSync(fileOne, 'https://example.org/one\n');
  fs.writeFileSync(fileTwo, 'https://example.org/two\n');

  const fileUrl = pathToFileURL(path.join(repoRoot, 'EveOS.html')).toString();
  const targetUrl = `${fileUrl}?ws=ws_smart_extract_card_per_file_${Date.now()}`;

  try {
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(14000);

    await page.evaluate(() => {
      if (typeof window.openBulkModal === 'function') window.openBulkModal();
    });
    await page.waitForSelector('#bulkModal', { state: 'visible', timeout: 10000 });
    await page.evaluate(() => {
      const fileMode = document.getElementById('bulkModeFile');
      if (fileMode) {
        fileMode.checked = true;
        fileMode.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const perFileToggle = document.getElementById('bulkSmartExtractCardPerFile');
      if (perFileToggle) {
        perFileToggle.checked = true;
        perFileToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.setInputFiles('#bulkFileInput', [fileOne, fileTwo]);
    await page.waitForTimeout(200);

    const initialSummary = await page.evaluate(() => {
      const panel = document.getElementById('bulkSmartExtractCardsPanel');
      const list = document.getElementById('bulkSmartExtractCardsList');
      const inputs = list ? Array.from(list.querySelectorAll('input[type="text"]')) : [];
      return {
        panelVisible: !!(panel && panel.style.display !== 'none'),
        inputCount: inputs.length,
        inputValues: inputs.map((input) => input.value)
      };
    });

    await page.locator('#bulkSmartExtractCardsList input[type="text"]').first().fill('Custom Edited Card');
    await page.waitForTimeout(100);

    const editedSummary = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('#bulkSmartExtractCardsList input[type="text"]'));
      const api = window.EveBulkImport && window.EveBulkImport._api;
      return {
        inputValues: inputs.map((input) => input.value),
        storedValues: api && api._smartExtractCardPerFileMap ? Object.values(api._smartExtractCardPerFileMap) : []
      };
    });

    const summary = {
      initialSummary,
      editedSummary,
      pageErrors,
      consoleErrors
    };

    console.log(JSON.stringify(summary, null, 2));

    const ok = initialSummary.panelVisible
      && initialSummary.inputCount === 2
      && initialSummary.inputValues.includes('Sample Series One')
      && initialSummary.inputValues.includes('Sample Series Two')
      && editedSummary.inputValues[0] === 'Custom Edited Card'
      && editedSummary.storedValues.includes('Custom Edited Card');

    if (!ok || pageErrors.length > 0) process.exitCode = 1;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (error) {}
    await browser.close();
  }
})();
