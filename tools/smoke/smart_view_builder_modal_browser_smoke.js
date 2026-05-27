const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent('<main id="app"></main>');
    await page.evaluate(() => {
      window.eveState = {
        config: {
          activeWorkspace: 'main',
          smartViews: { version: 1, cardViews: {} },
          bookmarkIdentifiers: [
            { id: 'reading', label: 'Reading' },
            { id: 'watching', label: 'Watching' }
          ]
        }
      };
      window.saveConfigCalls = [];
      window.renderDashboardCalls = 0;
      window.toastCalls = [];
      window.prompt = () => {
        throw new Error('Browser prompt should not be used by Smart View builder.');
      };
      window.saveConfig = (payload) => window.saveConfigCalls.push(payload);
      window.renderDashboard = () => { window.renderDashboardCalls += 1; };
      window.showToast = (message, kind) => window.toastCalls.push({ message, kind });
    });
    await page.addScriptTag({ path: path.join(REPO_ROOT, 'js/modules/features/bookmark-folders/smart-view-registry.js') });

    await page.evaluate(() => {
      window.EveSmartViewRegistry.promptCreateSmartView('main', 'Card');
    });
    await page.waitForSelector('[data-smart-view-builder]');
    await page.fill('[data-sv-field="label"]', 'Reading MangaDex Covers');
    await page.fill('[data-sv-field="query"]', 'cultivation');
    await page.fill('[data-sv-field="identifiers"]', 'Reading');
    await page.fill('[data-sv-field="provider"]', 'MangaDex');
    await page.selectOption('[data-sv-field="sourceFreshness"]', 'Fresh Source');
    await page.check('[data-sv-bool="hasCover"]');
    await page.click('.smart-view-builder-advanced summary');
    await page.fill('[data-sv-field="tokens"]', 'has:related merge:Merge_History');
    await page.click('.smart-view-builder-actions button[type="submit"]');
    await page.waitForFunction(() => !document.querySelector('[data-smart-view-builder]'));

    const result = await page.evaluate(() => {
      const list = window.eveState.config.smartViews.cardViews['main::Card'] || [];
      return {
        saved: list[0] || null,
        saveCalls: window.saveConfigCalls.length,
        renderCalls: window.renderDashboardCalls,
        toastCalls: window.toastCalls
      };
    });

    assert(result.saved, `Smart View was not saved: ${JSON.stringify(result)}`);
    assert(result.saved.label === 'Reading MangaDex Covers', `Saved label mismatch: ${JSON.stringify(result)}`);
    assert(result.saved.criteria.query === 'cultivation', `Saved query mismatch: ${JSON.stringify(result)}`);
    assert(Array.isArray(result.saved.criteria.identifiers) && result.saved.criteria.identifiers.includes('Reading'), `Identifier criteria missing: ${JSON.stringify(result)}`);
    assert(result.saved.criteria.provider === 'MangaDex', `Provider criteria missing: ${JSON.stringify(result)}`);
    assert(result.saved.criteria.sourceFreshness === 'Fresh Source', `Freshness criteria missing: ${JSON.stringify(result)}`);
    assert(result.saved.criteria.hasCover === true, `Cover criteria missing: ${JSON.stringify(result)}`);
    assert(result.saved.criteria.hasRelatedUrls === true, `Token criteria has:related missing: ${JSON.stringify(result)}`);
    assert(result.saved.criteria.mergeState === 'Merge History', `Token merge criteria missing: ${JSON.stringify(result)}`);
    assert(result.saveCalls === 1 && result.renderCalls === 1, `Save/render hooks were not called once: ${JSON.stringify(result)}`);

    console.log(`SMART_VIEW_BUILDER_MODAL_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) {}
    }
  }
}

main();
