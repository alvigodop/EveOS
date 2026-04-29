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
  const categoryName = 'Folder Reveal Toggle Test';
  const folderId = 'folder-reveal-smoke';

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const result = await page.evaluate(async ({ targetCategory, targetFolderId }) => {
    const rawLinks = (typeof window.getLiveLinks === 'function')
      ? window.getLiveLinks()
      : ((typeof links !== 'undefined' && Array.isArray(links))
        ? links
        : (Array.isArray(window.eveState?.links) ? window.eveState.links : []));
    const workspaceId = String(window.eveState?.config?.activeWorkspace || 'main');
    const scopedFolderKey = `${workspaceId}::${targetCategory}`;

    if (window.eveState?.config) window.eveState.config.viewMode = 'dashboard';
    if (typeof config !== 'undefined' && config) config.viewMode = 'dashboard';

    window.eveState.bookmarkFolders = window.eveState.bookmarkFolders || {};
    window.eveState.bookmarkFolders[scopedFolderKey] = {
      nodes: [{
        id: targetFolderId,
        name: 'Reveal Smoke Folder',
        parentId: null,
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }],
      settings: {}
    };
    window.bookmarkFolders = window.eveState.bookmarkFolders;

    for (let index = 0; index < 60; index += 1) {
      rawLinks.push({
        id: `folder-reveal-${Date.now()}-${index}`,
        title: `Folder Reveal Item ${index + 1}`,
        url: `https://example.com/folder-reveal-${index + 1}`,
        category: targetCategory,
        workspace: workspaceId,
        folderId: targetFolderId,
        icon: '',
        done: false
      });
    }

    if (window.EveCategoryOrder?.ensureCategory) {
      window.EveCategoryOrder.ensureCategory(workspaceId, targetCategory);
    } else {
      window.eveState.config.categoryOrder = Array.isArray(window.eveState.config.categoryOrder)
        ? window.eveState.config.categoryOrder
        : [];
      if (!window.eveState.config.categoryOrder.includes(targetCategory)) {
        window.eveState.config.categoryOrder.push(targetCategory);
      }
    }

    const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index;
    if (indexApi?.markDirty) {
      indexApi.markDirty('folder-bookmark-reveal-toggle-smoke', { workspaceId, categoryName: targetCategory, folderId: targetFolderId });
    }
    if (indexApi?.ensureFresh) {
      await indexApi.ensureFresh({ reason: 'folder-bookmark-reveal-toggle-smoke', force: true });
    }

    window.DashboardCategories.setCardBookmarkProgressiveRevealEnabled(workspaceId, targetCategory, false);
    window.DashboardCategories.setFolderBookmarkProgressiveRevealMode(workspaceId, targetCategory, targetFolderId, 'on');
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (window.EveFolderViewV2?.enterFolder) {
      window.EveFolderViewV2.enterFolder(null, targetCategory, targetFolderId, workspaceId, { preservePageScroll: false });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const getCard = () => document.querySelector(`.category-card[data-card-category="${targetCategory}"][data-card-workspace="${workspaceId}"]`);
    const getFolderSurface = () => getCard()?.querySelector('.v2-folder-container, .bookmark-folder-group, .folder-tile');
    const getFolderList = () => getCard()?.querySelector('.v2-folder-container .bookmark-folder-links ul, .bookmark-folder-group .bookmark-folder-links ul');
    const getShowMore = () => getCard()?.querySelector('.v2-folder-container .eve-show-more-item, .bookmark-folder-group .eve-show-more-item');

    const beforeState = {
      cardExists: !!getCard(),
      folderExists: !!getFolderSurface(),
      showMorePresent: !!getShowMore(),
      renderedItems: getFolderList()?.querySelectorAll('li').length || 0,
      folderMode: window.DashboardCategories.getFolderBookmarkProgressiveRevealMode(workspaceId, targetCategory, targetFolderId)
    };

    window.DashboardCategories.setFolderBookmarkProgressiveRevealMode(workspaceId, targetCategory, targetFolderId, 'off');
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (window.EveFolderViewV2?.enterFolder) {
      window.EveFolderViewV2.enterFolder(null, targetCategory, targetFolderId, workspaceId, { preservePageScroll: false });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const afterState = {
      cardExists: !!getCard(),
      folderExists: !!getFolderSurface(),
      showMorePresent: !!getShowMore(),
      renderedItems: getFolderList()?.querySelectorAll('li').length || 0,
      folderMode: window.DashboardCategories.getFolderBookmarkProgressiveRevealMode(workspaceId, targetCategory, targetFolderId)
    };

    return { beforeState, afterState };
  }, { targetCategory: categoryName, targetFolderId: folderId });

  console.log(JSON.stringify(result, null, 2));

  assert(result.beforeState.cardExists, 'Folder reveal test card did not render');
  assert(result.beforeState.folderExists, 'Folder reveal test folder did not render');
  assert(result.beforeState.folderMode === 'on', 'Folder mode should be on before toggle');
  assert(result.beforeState.showMorePresent, 'Folder should show Show more when folder override is on');
  assert(result.afterState.cardExists, 'Folder reveal test card disappeared after toggle');
  assert(result.afterState.folderExists, 'Folder reveal test folder disappeared after toggle');
  assert(result.afterState.folderMode === 'off', 'Folder mode should be off after toggle');
  assert(!result.afterState.showMorePresent, 'Folder Show more should disappear when folder override is off');
  assert(result.afterState.renderedItems >= 60, `Expected all folder bookmarks rendered after disabling folder reveal, got ${result.afterState.renderedItems}`);

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
