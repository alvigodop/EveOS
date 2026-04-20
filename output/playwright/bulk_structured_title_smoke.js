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
    const processStructuredFile = window.EveBulkImport?._api?.processStructuredFile || window.processStructuredFile;
    const processBulk = window.EveBulkImport?._api?.processBulk || window.processBulk;
    const rawLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    const beforeLinks = rawLinks.length;
    const beforeConnections = Array.isArray(window.EveLibrary?.ConnectionsCore?.connections)
      ? window.EveLibrary.ConnectionsCore.connections.length
      : 0;

    const imported = processStructuredFile(
      'Some Real Title\n3\nURL: https://example.com',
      '3.txt',
      'Start',
      '',
      { deferLibrarySave: true, silent: true }
    );

    const allLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    const createdLink = allLinks.find((entry) => String(entry?.id) === String(imported?.id)) || null;
    const connection = window.EveLibrary?.ConnectionsCore?.findConnectionByLinkId
      ? window.EveLibrary.ConnectionsCore.findConnectionByLinkId(imported?.id)
      : null;
    const libraryEntryLookup = connection && window.EveLibrary?.ConnectionsCore?.findEntryByConnection
      ? window.EveLibrary.ConnectionsCore.findEntryByConnection(connection) || null
      : null;
    const libraryEntry = libraryEntryLookup?.entry
      || window.EveLibrary?.State?.getCategoryLibrary?.('Start', 'main')?.entries?.find((entry) => String(entry?.id) === String(connection?.libraryEntryId))
      || null;

    const directResult = {
      beforeLinks,
      afterLinks: allLinks.length,
      beforeConnections,
      afterConnections: Array.isArray(window.EveLibrary?.ConnectionsCore?.connections)
        ? window.EveLibrary.ConnectionsCore.connections.length
        : 0,
      createdLink: createdLink ? {
        id: createdLink.id,
        title: createdLink.title,
        url: createdLink.url,
        notes: createdLink.notes || '',
        category: createdLink.category
      } : null,
      connection: connection ? {
        id: connection.id,
        linkId: connection.linkId,
        libraryEntryId: connection.libraryEntryId,
        categoryName: connection.categoryName,
        workspace: connection.workspace
      } : null,
      libraryEntry: libraryEntry ? {
        title: libraryEntry.title,
        chapter: libraryEntry.chapter || 0,
        episode: libraryEntry.episode || 0,
        summary: libraryEntry.summary || '',
        mediaTypes: Array.isArray(libraryEntry.mediaTypes) ? libraryEntry.mediaTypes.slice() : []
      } : null
    };

    const modeFile = document.getElementById('bulkModeFile');
    const categoryInput = document.getElementById('bulkCategory');
    const fileInput = document.getElementById('bulkFileInput');
    if (modeFile) modeFile.checked = true;
    if (categoryInput) categoryInput.value = 'Start';
    window.EveBulkImport?._api?.updateBulkModeUi?.();

    const bulkBeforeLinks = allLinks.length;
    const bulkBeforeConnections = Array.isArray(window.EveLibrary?.ConnectionsCore?.connections)
      ? window.EveLibrary.ConnectionsCore.connections.length
      : 0;

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(
      ['3'],
      'The Reincarnated Man_260227_215805.txt',
      { type: 'text/plain' }
    ));
    if (fileInput) {
      fileInput.files = dataTransfer.files;
    }

    await processBulk();

    const finalLinks = (typeof links !== 'undefined' && Array.isArray(links))
      ? links
      : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
    const bulkImported = finalLinks
      .slice(bulkBeforeLinks)
      .find((entry) => String(entry?.title || '').includes('The Reincarnated Man')) || null;
    const bulkConnection = bulkImported && window.EveLibrary?.ConnectionsCore?.findConnectionByLinkId
      ? window.EveLibrary.ConnectionsCore.findConnectionByLinkId(bulkImported.id)
      : null;
    const bulkLibraryEntryLookup = bulkConnection && window.EveLibrary?.ConnectionsCore?.findEntryByConnection
      ? window.EveLibrary.ConnectionsCore.findEntryByConnection(bulkConnection) || null
      : null;
    const bulkLibraryEntry = bulkLibraryEntryLookup?.entry || null;

    return {
      directResult,
      bulkResult: {
        beforeLinks: bulkBeforeLinks,
        afterLinks: finalLinks.length,
        beforeConnections: bulkBeforeConnections,
        afterConnections: Array.isArray(window.EveLibrary?.ConnectionsCore?.connections)
          ? window.EveLibrary.ConnectionsCore.connections.length
          : 0,
        createdLink: bulkImported ? {
          id: bulkImported.id,
          title: bulkImported.title,
          url: bulkImported.url,
          notes: bulkImported.notes || '',
          category: bulkImported.category
        } : null,
        connection: bulkConnection ? {
          id: bulkConnection.id,
          linkId: bulkConnection.linkId,
          libraryEntryId: bulkConnection.libraryEntryId,
          categoryName: bulkConnection.categoryName,
          workspace: bulkConnection.workspace
        } : null,
        libraryEntry: bulkLibraryEntry ? {
          title: bulkLibraryEntry.title,
          chapter: bulkLibraryEntry.chapter || 0,
          episode: bulkLibraryEntry.episode || 0,
          summary: bulkLibraryEntry.summary || '',
          mediaTypes: Array.isArray(bulkLibraryEntry.mediaTypes) ? bulkLibraryEntry.mediaTypes.slice() : []
        } : null
      }
    };
  });

  console.log(JSON.stringify(result, null, 2));

  assert(result.directResult.afterLinks === result.directResult.beforeLinks + 1, 'Structured import did not add a bookmark');
  assert(result.directResult.afterConnections === result.directResult.beforeConnections + 1, 'Structured import did not create a library link');
  assert(result.directResult.createdLink && result.directResult.createdLink.title === 'Some Real Title', `Bookmark title mismatch: ${result.directResult.createdLink?.title}`);
  assert(result.directResult.createdLink && /\b3\b/.test(result.directResult.createdLink.notes), 'Bare numeric line did not land in bookmark notes');
  assert(result.directResult.libraryEntry && result.directResult.libraryEntry.title === 'Some Real Title', `Library entry title mismatch: ${result.directResult.libraryEntry?.title}`);
  assert(result.directResult.libraryEntry && Number(result.directResult.libraryEntry.chapter) === 0, 'Bare numeric line incorrectly set chapter');
  assert(result.directResult.libraryEntry && Number(result.directResult.libraryEntry.episode) === 0, 'Bare numeric line incorrectly set episode');
  assert(result.directResult.libraryEntry && /\b3\b/.test(result.directResult.libraryEntry.summary), 'Bare numeric line did not land in library summary');

  assert(result.bulkResult.afterLinks === result.bulkResult.beforeLinks + 1, 'Bulk file import did not add a bookmark');
  assert(result.bulkResult.afterConnections === result.bulkResult.beforeConnections + 1, 'Bulk file import did not create a library link');
  assert(result.bulkResult.createdLink && result.bulkResult.createdLink.title === 'The Reincarnated Man', `Bulk bookmark title mismatch: ${result.bulkResult.createdLink?.title}`);
  assert(result.bulkResult.createdLink && /\b3\b/.test(result.bulkResult.createdLink.notes), 'Bulk progress token did not land in bookmark notes');
  assert(result.bulkResult.libraryEntry && result.bulkResult.libraryEntry.title === 'The Reincarnated Man', `Bulk library entry title mismatch: ${result.bulkResult.libraryEntry?.title}`);
  assert(result.bulkResult.libraryEntry && Number(result.bulkResult.libraryEntry.chapter) === 0, 'Bulk bare numeric line incorrectly set chapter');
  assert(result.bulkResult.libraryEntry && Number(result.bulkResult.libraryEntry.episode) === 0, 'Bulk bare numeric line incorrectly set episode');
  assert(result.bulkResult.libraryEntry && /\b3\b/.test(result.bulkResult.libraryEntry.summary), 'Bulk progress token did not land in library summary');

  await page.screenshot({ path: path.resolve(repoRoot, 'output/playwright/bulk_structured_title_smoke.png'), fullPage: false });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
