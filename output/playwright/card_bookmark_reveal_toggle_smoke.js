const { chromium } = require('playwright');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..', '..');
  const url = 'file:///' + path.resolve(repoRoot, 'EveOS.html').replace(/\\/g, '/');
  const categoryName = 'Bookmark Reveal Toggle Test';

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const result = await page.evaluate(async (targetCategory) => {
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    const workspaceId = String(window.eveState?.config?.activeWorkspace || 'main');
    if (window.eveState?.config) window.eveState.config.viewMode = 'dashboard';
    if (typeof config !== 'undefined' && config) config.viewMode = 'dashboard';

    for (let index = 0; index < 60; index += 1) {
      rawLinks.push({
        id: Date.now() + Math.random() + index,
        title: `Reveal Item ${index + 1}`,
        url: `https://example.com/reveal-${index + 1}`,
        category: targetCategory,
        workspace: workspaceId,
        icon: '',
        done: false
      });
    }

    if (window.EveCategoryOrder?.ensureCategory) {
      window.EveCategoryOrder.ensureCategory(workspaceId, targetCategory);
    } else if (!Array.isArray(window.eveState.config.categoryOrder)) {
      window.eveState.config.categoryOrder = [];
    }
    if (!window.EveCategoryOrder?.ensureCategory && !window.eveState.config.categoryOrder.includes(targetCategory)) {
      window.eveState.config.categoryOrder.push(targetCategory);
    }

    const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index;
    if (indexApi?.markDirty) {
      indexApi.markDirty('card-bookmark-reveal-toggle-smoke', { workspaceId, categoryName: targetCategory });
    }
    if (indexApi?.ensureFresh) {
      await indexApi.ensureFresh({ reason: 'card-bookmark-reveal-toggle-smoke', force: true });
    }

    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    const getCard = () => document.querySelector(`.category-card[data-card-category="${targetCategory}"]`);
    const getList = () => getCard()?.querySelector('ul');
    const getShowMore = () => getCard()?.querySelector('.eve-show-more-item');

    const beforeCard = getCard();
    const beforeToggleState = {
      showMorePresent: !!getShowMore(),
      renderedItems: getList()?.querySelectorAll('li').length || 0
    };

    window.openCategorySettings(targetCategory, 'general', workspaceId);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const checkbox = document.getElementById('categoryBookmarkProgressiveRevealToggle');
    const checkboxVisible = !!checkbox;
    const checkboxCheckedBefore = !!checkbox?.checked;

    if (checkbox) {
      checkbox.checked = false;
      window.saveCategoryBookmarkProgressiveRevealSetting(false);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    const afterCard = getCard();
    const afterToggleState = {
      showMorePresent: !!getShowMore(),
      renderedItems: getList()?.querySelectorAll('li').length || 0,
      checkboxCheckedAfter: !!document.getElementById('categoryBookmarkProgressiveRevealToggle')?.checked
    };

    return {
      beforeCardExists: !!beforeCard,
      afterCardExists: !!afterCard,
      checkboxVisible,
      checkboxCheckedBefore,
      beforeToggleState,
      afterToggleState
    };
  }, categoryName);

  console.log(JSON.stringify(result, null, 2));

  assert(result.beforeCardExists, 'Test card did not render before toggle');
  assert(result.checkboxVisible, 'Bookmark display toggle did not render in card settings');
  assert(result.checkboxCheckedBefore, 'Bookmark display toggle should default to enabled');
  assert(result.beforeToggleState.showMorePresent, 'Show more button should be present before disabling the feature');
  assert(result.afterCardExists, 'Test card did not render after toggle');
  assert(!result.afterToggleState.showMorePresent, 'Show more button should disappear after disabling the feature');
  assert(result.afterToggleState.renderedItems >= 60, `Expected all bookmarks rendered after disabling, got ${result.afterToggleState.renderedItems}`);
  assert(!result.afterToggleState.checkboxCheckedAfter, 'Bookmark display toggle should remain unchecked after disabling');

  await page.screenshot({
    path: path.resolve(repoRoot, 'output/playwright/card_bookmark_reveal_toggle_smoke.png'),
    fullPage: false
  });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
