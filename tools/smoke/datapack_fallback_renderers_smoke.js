const { chromium } = require('playwright');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..', '..');
  const url = 'file:///' + path.resolve(repoRoot, 'EveOS.html').replace(/\\/g, '/');

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.EveOS?.DatapackIndex && window.DashboardCategories && window.EveLibrary?.ConnectionsAPI), null, { timeout: 30000 });
  await page.waitForTimeout(9000);

  const result = await page.evaluate(async () => {
    const indexApi = window.EveOS?.DatapackIndex;
    const folderApi = window.EveBookmarkFolders;
    const linkId = `fallback-link-${Date.now()}`;
    const coverDataUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="96"><rect width="64" height="96" fill="#224466"/><text x="32" y="52" font-size="14" text-anchor="middle" fill="#ffffff">FB</text></svg>'
    );

    const link = {
      id: linkId,
      title: 'Fallback Render Entry',
      url: 'https://example.com/fallback-render-entry',
      category: 'Fallback Card',
      workspace: 'main',
      icon: 'https://example.com/icon.png',
      coverImage: coverDataUri,
      identifiers: ['research'],
      notes: 'Fallback smoke note',
      done: false
    };

    const liveLinks = Array.isArray(window.eveState?.links)
      ? window.eveState.links
      : (Array.isArray(window.links) ? window.links : []);
    liveLinks.push(link);
    window.links = liveLinks;
    if (window.eveState) window.eveState.links = liveLinks;

    if (folderApi?.setCardTaskEnabled) {
      folderApi.setCardTaskEnabled('main', 'Fallback Card', true);
    }

    const conn = window.EveLibrary?.ConnectionsAPI?.promoteLinkWithData
      ? window.EveLibrary.ConnectionsAPI.promoteLinkWithData(linkId, {
          title: 'Fallback Render Entry',
          mediaTypes: ['graphicNovels'],
          summary: 'Fallback smoke summary'
        }, { deferSave: true, silent: true })
      : null;

    const linked = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(linkId) || null;
    const entry = linked?.entry || null;

    await Promise.resolve(indexApi.rebuild({ reason: 'fallback-renderers-smoke' }));

    const taskEnabledBeforeClear = folderApi?.isTaskEnabledForLink
      ? folderApi.isTaskEnabledForLink(linkId)
      : null;

    if (window.eveState) window.eveState.links = [];
    window.links = [];

    const taskEnabledAfterClear = folderApi?.isTaskEnabledForLink
      ? folderApi.isTaskEnabledForLink(linkId)
      : null;

    const templates = window.EveLibrary.Modules.createEntriesRendererTemplates({
      helpers: typeof window.EveLibrary.Modules.createEntriesRendererHelpers === 'function'
        ? window.EveLibrary.Modules.createEntriesRendererHelpers()
        : {},
      Ratings: window.EveLibrary.Ratings
    });
    const entryHtml = templates.createEntryHtml(entry, 1, 'graphicNovels', 'Fallback Card');

    const target = document.createElement('button');
    target.textContent = 'hover target';
    document.body.appendChild(target);
    window.showBookmarkCoverHover({ currentTarget: target }, linkId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const overlay = document.getElementById('bookmark-cover-hover-overlay');
    const overlayImage = overlay?.querySelector('.bookmark-cover-hover-image');
    const fallbackResolved = indexApi?.resolveBookmarkLink ? indexApi.resolveBookmarkLink(linkId) : null;
    const libraryConnByEntry = window.EveLibrary?.ConnectionsCore?.findConnectionByLibraryEntryId
      ? window.EveLibrary.ConnectionsCore.findConnectionByLibraryEntryId(entry?.id)
      : null;

    return {
      taskEnabledBeforeClear,
      taskEnabledAfterClear,
      hasIdentifierBadgeHtml: /lib-entry-identifiers/.test(entryHtml),
      fallbackResolved: fallbackResolved ? {
        id: fallbackResolved.id,
        identifiers: Array.isArray(fallbackResolved.identifiers) ? fallbackResolved.identifiers.slice() : [],
        coverImage: String(fallbackResolved.coverImage || ''),
        icon: String(fallbackResolved.icon || '')
      } : null,
      hoverVisible: !!overlay?.classList.contains('is-visible'),
      hoverImageSrc: String(overlayImage?.getAttribute('src') || ''),
      libraryConnByEntry: libraryConnByEntry ? {
        libraryEntryId: String(libraryConnByEntry.libraryEntryId || ''),
        linkId: String(libraryConnByEntry.linkId || '')
      } : null,
      connectionCreated: !!conn,
      linkedEntryFound: !!entry
    };
  });

  console.log(JSON.stringify(result, null, 2));

  assert(result.connectionCreated, 'Library connection was not created for fallback smoke');
  assert(result.linkedEntryFound, 'Linked library entry was not found for fallback smoke');
  assert(result.taskEnabledBeforeClear === true, 'Task mode should be enabled before clearing live links');
  assert(result.taskEnabledAfterClear === true, 'Task mode should still resolve from datapack fallback after clearing live links');
  assert(result.hasIdentifierBadgeHtml === true, 'Library entry renderer lost identifier badge HTML on datapack fallback');
  assert(result.fallbackResolved && result.fallbackResolved.identifiers.includes('research'), 'Datapack fallback link lost bookmark identifiers');
  assert(result.fallbackResolved && result.fallbackResolved.coverImage.startsWith('data:image/'), 'Datapack fallback link lost cover image');
  assert(result.fallbackResolved && !!result.fallbackResolved.icon, 'Datapack fallback link lost icon');
  assert(result.hoverVisible === true, 'Bookmark hover preview did not stay visible on datapack fallback');
  assert(result.hoverImageSrc.startsWith('data:image/'), 'Bookmark hover preview did not use fallback cover image');
  assert(result.libraryConnByEntry && result.libraryConnByEntry.linkId === result.fallbackResolved.id, 'Library entry connection index did not resolve by library entry id');

  await page.screenshot({ path: path.resolve(repoRoot, 'output/playwright/datapack_fallback_renderers_smoke.png'), fullPage: false });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
