const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
  await page.waitForFunction(() => (
    typeof window.openBulkModal === 'function'
    && typeof window.clearBulkInput === 'function'
    && typeof window.autoFormatBulkText === 'function'
    && !!window.EveBulkImport?._api
  ), undefined, { timeout: 120000 });
}

async function readState(page) {
  return page.evaluate(() => ({
    mode: window.EveBulkImport._api.getBulkMode(),
    modalDisplay: document.getElementById('bulkModal')?.style.display || '',
    textDisplay: document.getElementById('bulkText')?.style.display || '',
    placeholder: document.getElementById('bulkText')?.placeholder || '',
    hint: document.getElementById('bulkModeHint')?.textContent.trim() || '',
    autoButtonLabel: document.getElementById('bulkAutoLineBreakBtn')?.textContent.trim() || '',
    autoButtonDisplay: document.getElementById('bulkAutoLineBreakBtn')?.style.display || '',
    folderDropDisplay: document.getElementById('bulkFolderDropZone')?.style.display || '',
    categoryWrapperDisplay: document.getElementById('bulkCategoryWrapper')?.style.display || '',
    latentPanelDisplay: document.getElementById('bulkLatentCardsPanel')?.style.display || '',
    latentInputs: Array.from(document.querySelectorAll('#bulkLatentCardsList input')).map((input) => input.value)
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 120000 });
    await waitForApp(page);

    await page.evaluate(() => window.openBulkModal());
    let state = await readState(page);
    if (state.modalDisplay !== 'flex') throw new Error(`Bulk modal did not open: ${state.modalDisplay}`);
    if (state.mode !== 'url') throw new Error(`Expected default bulk mode to be url, got ${state.mode}`);
    if (state.placeholder !== 'One URL per line...') throw new Error(`Unexpected URL placeholder: ${state.placeholder}`);
    if (state.autoButtonLabel !== 'Auto Line Break URLs') throw new Error(`Unexpected URL button label: ${state.autoButtonLabel}`);

    await page.evaluate(() => {
      const text = document.getElementById('bulkText');
      text.value = 'https://a.example.com, https://b.example.com https://c.example.com';
      window.autoFormatBulkText();
    });
    let urlText = await page.evaluate(() => document.getElementById('bulkText').value);
    if (urlText.split('\n').length !== 3) throw new Error(`URL auto split failed: ${JSON.stringify(urlText)}`);

    await page.evaluate(() => {
      const radio = document.getElementById('bulkModeName');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    });
    state = await readState(page);
    if (state.mode !== 'name') throw new Error(`Expected name mode, got ${state.mode}`);
    if (state.placeholder !== 'One name per line...') throw new Error(`Unexpected name placeholder: ${state.placeholder}`);
    if (state.autoButtonLabel !== 'Auto Line Break Names') throw new Error(`Unexpected name button label: ${state.autoButtonLabel}`);

    await page.evaluate(() => {
      const text = document.getElementById('bulkText');
      text.value = 'Alpha; Beta; Gamma';
      window.autoFormatBulkText();
    });
    const nameText = await page.evaluate(() => document.getElementById('bulkText').value);
    if (nameText.split('\n').length !== 3) throw new Error(`Name auto split failed: ${JSON.stringify(nameText)}`);

    await page.evaluate(() => {
      window.EveBulkImport._api._accumulatedFolderFiles = [
        { name: 'a.txt', customRelativePath: 'Root A/a.txt' },
        { name: 'b.txt', customRelativePath: 'Root B/b.txt' }
      ];
      const radio = document.getElementById('bulkModeCard');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    });
    state = await readState(page);
    if (state.mode !== 'card') throw new Error(`Expected card mode, got ${state.mode}`);
    if (state.textDisplay !== 'none') throw new Error(`Text area should be hidden in card mode: ${state.textDisplay}`);
    if (state.folderDropDisplay !== 'flex') throw new Error(`Folder drop zone should be visible in card mode: ${state.folderDropDisplay}`);
    if (state.categoryWrapperDisplay !== 'none') throw new Error(`Category wrapper should be hidden in card mode: ${state.categoryWrapperDisplay}`);
    if (state.latentPanelDisplay !== 'flex') throw new Error(`Latent panel should be visible in card mode: ${state.latentPanelDisplay}`);
    if (state.latentInputs.join('|') !== 'Root A|Root B') {
      throw new Error(`Unexpected latent card defaults: ${state.latentInputs.join('|')}`);
    }

    await page.evaluate(() => {
      window.openBulkModal();
      window.clearBulkInput();
    });
    state = await readState(page);
    if (state.latentInputs.length !== 0) throw new Error(`Clear should reset latent inputs: ${state.latentInputs.join('|')}`);

    console.log('MODAL_BULK_RUNTIME_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error('MODAL_BULK_RUNTIME_SMOKE_FAIL:', error && error.message ? error.message : error);
  process.exit(1);
});
