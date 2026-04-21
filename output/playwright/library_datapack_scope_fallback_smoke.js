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
  await page.waitForFunction(() => Boolean(window.EveOS?.DatapackIndex && window.EveLibrary?.Search && window.EveLibrary?.BulkAutoPatch), null, { timeout: 30000 });
  await page.waitForTimeout(9000);

  const result = await page.evaluate(async () => {
    const indexApi = window.EveOS?.DatapackIndex;
    const folderApi = window.EveBookmarkFolders;
    const State = window.EveLibrary.State;
    const Search = window.EveLibrary.Search;
    const BulkPatch = window.EveLibrary.BulkAutoPatch;
    const Connections = window.EveLibrary.ConnectionsAPI;
    const categoryName = `LibraryScopeFallback_${Date.now()}`;
    const folder = folderApi?.createFolder
      ? folderApi.createFolder({
          workspaceId: 'main',
          categoryName,
          name: 'Library Folder',
          persist: false
        })
      : null;
    const folderId = String(folder?.id || '');

    const linkA = {
      id: `lib-scope-link-a-${Date.now()}`,
      title: 'Scoped Library Link A',
      url: 'https://example.com/library-scope-a',
      category: categoryName,
      workspace: 'main',
      folderId,
      icon: '',
      done: false
    };
    const linkB = {
      id: `lib-scope-link-b-${Date.now()}`,
      title: 'Scoped Library Link B',
      url: 'https://example.com/library-scope-b',
      category: categoryName,
      workspace: 'main',
      icon: '',
      done: false
    };

    const liveLinks = Array.isArray(window.eveState?.links)
      ? window.eveState.links
      : (Array.isArray(window.links) ? window.links : []);
    liveLinks.push(linkA, linkB);
    window.links = liveLinks;
    if (window.eveState) window.eveState.links = liveLinks;

    Connections.promoteLinkWithData(linkA.id, {
      title: 'Scoped Library Link A',
      mediaTypes: ['graphicNovels'],
      summary: 'Folder scoped entry'
    }, { deferSave: true, silent: true });

    await Promise.resolve(indexApi.rebuild({ reason: 'library-scope-fallback-smoke' }));

    State.setCategoryFolderView(categoryName, {
      root: `folder:${folderId}`,
      chain: [{ selection: 'self' }],
      expanded: false
    }, 'main');

    if (window.eveState) window.eveState.links = [];
    window.links = [];

    const folderScopedEntries = Search.getFolderScopedEntries(categoryName);
    const patchCategoryLinks = typeof BulkPatch.getCategoryLinks === 'function'
      ? BulkPatch.getCategoryLinks(categoryName)
      : [];
    const patchLinkById = typeof BulkPatch.getLinkById === 'function'
      ? BulkPatch.getLinkById(linkA.id)
      : null;
    const coreLinkById = window.EveLibrary?.ConnectionsCore?.findLinkById
      ? window.EveLibrary.ConnectionsCore.findLinkById(linkB.id)
      : null;
    const promotedFallback = Connections.promoteLinkWithData(linkB.id, {
      title: 'Scoped Library Link B',
      mediaTypes: ['graphicNovels'],
      summary: 'Fallback promote entry'
    }, { deferSave: true, silent: true });

    return {
      folderScopedEntryTitles: folderScopedEntries.map((entry) => entry.title),
      patchCategoryLinks: patchCategoryLinks.map((link) => ({
        id: String(link.id || ''),
        title: String(link.title || ''),
        folderId: String(link.folderId || '')
      })),
      patchLinkById: patchLinkById ? {
        id: String(patchLinkById.id || ''),
        title: String(patchLinkById.title || ''),
        folderId: String(patchLinkById.folderId || '')
      } : null,
      coreLinkById: coreLinkById ? {
        id: String(coreLinkById.id || ''),
        title: String(coreLinkById.title || '')
      } : null,
      promotedFallback: promotedFallback ? {
        linkId: String(promotedFallback.linkId || ''),
        categoryName: String(promotedFallback.categoryName || ''),
        workspace: String(promotedFallback.workspace || '')
      } : null
    };
  });

  console.log(JSON.stringify(result, null, 2));

  assert(result.folderScopedEntryTitles.includes('Scoped Library Link A'), 'Library folder-scoped entries lost the linked entry on datapack fallback');
  assert(!result.folderScopedEntryTitles.includes('Scoped Library Link B'), 'Library folder-scoped entries leaked a root entry into the folder scope');
  assert(result.patchCategoryLinks.length === 2, 'Bulk auto category links did not resolve category bookmarks from datapack fallback');
  assert(result.patchLinkById && result.patchLinkById.title === 'Scoped Library Link A', 'Bulk auto link lookup did not resolve bookmark by id from datapack fallback');
  assert(result.coreLinkById && result.coreLinkById.title === 'Scoped Library Link B', 'ConnectionsCore.findLinkById did not resolve bookmark from datapack fallback');
  assert(result.promotedFallback && result.promotedFallback.linkId === result.coreLinkById.id, 'Fallback promote did not create a connection for the indexed bookmark');

  await page.screenshot({ path: path.resolve(repoRoot, 'output/playwright/library_datapack_scope_fallback_smoke.png'), fullPage: false });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
