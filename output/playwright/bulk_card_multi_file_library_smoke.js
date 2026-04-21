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

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const result = await page.evaluate(async () => {
    const api = window.EveBulkImport?._api;
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    const beforeLinks = rawLinks.length;
    const beforeConnections = Array.isArray(window.EveLibrary?.ConnectionsCore?.connections)
      ? window.EveLibrary.ConnectionsCore.connections.length
      : 0;

    document.getElementById('bulkModeCard').checked = true;
    api.updateBulkModeUi();

    const sharedContent = '3\nSome note about the series\nAnother note';
    const sharedLastModified = 1776000000000;
    const buildFile = (relativePath) => {
      const file = new File(
        [sharedContent],
        relativePath.split('/').pop(),
        { type: 'text/plain', lastModified: sharedLastModified }
      );
      Object.defineProperty(file, 'customRelativePath', {
        value: relativePath,
        configurable: true
      });
      return file;
    };

    api._accumulatedFolderFiles = [
      buildFile('RootA/The Reincarnated Man_260227_215805.txt'),
      buildFile('RootB/The Reincarnated Man_260227_215805.txt')
    ];
    api._latentCardMap = {
      RootA: 'Card A',
      RootB: 'Card B'
    };

    await api.processBulk();

    const allLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    const createdLinks = allLinks.slice(beforeLinks)
      .map((link) => ({
        id: String(link.id),
        title: link.title,
        url: link.url,
        notes: link.notes || '',
        category: link.category,
        workspace: link.workspace,
        folderId: link.folderId || ''
      }))
      .sort((left, right) => String(left.category).localeCompare(String(right.category)));

    const createdConnections = (window.EveLibrary?.ConnectionsCore?.connections || [])
      .slice(beforeConnections)
      .map((conn) => ({
        linkId: String(conn.linkId),
        categoryName: conn.categoryName,
        workspace: conn.workspace
      }))
      .sort((left, right) => String(left.categoryName).localeCompare(String(right.categoryName)));

    const linkedEntries = createdLinks.map((link) => {
      const conn = window.EveLibrary?.ConnectionsCore?.findConnectionByLinkId
        ? window.EveLibrary.ConnectionsCore.findConnectionByLinkId(link.id)
        : null;
      const found = conn && window.EveLibrary?.ConnectionsCore?.findEntryByConnection
        ? window.EveLibrary.ConnectionsCore.findEntryByConnection(conn) || null
        : null;
      return {
        link,
        connection: conn ? {
          linkId: String(conn.linkId),
          categoryName: conn.categoryName,
          workspace: conn.workspace
        } : null,
        entry: found?.entry ? {
          title: found.entry.title,
          chapter: found.entry.chapter || 0,
          episode: found.entry.episode || 0,
          summary: found.entry.summary || '',
          mediaTypes: Array.isArray(found.entry.mediaTypes) ? found.entry.mediaTypes.slice() : []
        } : null
      };
    });

    return {
      createdLinks,
      createdConnections,
      linkedEntries
    };
  });

  console.log(JSON.stringify(result, null, 2));

  assert(result.createdLinks.length === 2, 'Cards bulk import should create two bookmarks for two same-name files in different roots');
  assert(JSON.stringify(result.createdLinks.map((link) => link.category)) === JSON.stringify(['Card A', 'Card B']), 'Cards bulk import wrote wrong card categories');
  assert(result.createdLinks.every((link) => link.title === 'The Reincarnated Man'), 'Cards bulk import did not preserve cleaned file title');
  assert(result.createdLinks.every((link) => /\b3\b/.test(link.notes) && /Another note/.test(link.notes)), 'Cards bulk import did not keep note/progress text on bookmarks');
  assert(result.createdConnections.length === 2, 'Cards bulk import did not create library connections for both entry files');
  assert(JSON.stringify(result.createdConnections.map((conn) => conn.categoryName)) === JSON.stringify(['Card A', 'Card B']), 'Library connections were not scoped to the correct cards');
  assert(result.linkedEntries.every((entry) => entry.entry && entry.entry.title === 'The Reincarnated Man'), 'Library entry titles were not linked correctly');
  assert(result.linkedEntries.every((entry) => entry.entry && /\b3\b/.test(entry.entry.summary) && /Another note/.test(entry.entry.summary)), 'Library summaries did not receive the imported file content');
  assert(result.linkedEntries.every((entry) => Number(entry.entry.chapter) === 0 && Number(entry.entry.episode) === 0), 'Unlabeled progress-only files should not set chapter/episode automatically');

  await page.screenshot({ path: path.resolve(repoRoot, 'output/playwright/bulk_card_multi_file_library_smoke.png'), fullPage: false });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
