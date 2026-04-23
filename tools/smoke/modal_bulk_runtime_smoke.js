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

    const parserCases = await page.evaluate(() => {
      const api = window.EveBulkImport && window.EveBulkImport._api;
      if (!api || typeof api.processStructuredFile !== 'function') {
        throw new Error('Bulk structured parser API unavailable');
      }

      const priorPromoter = window.EveLibrary?.ConnectionsAPI?.promoteLinkWithData;
      if (window.EveLibrary?.ConnectionsAPI) {
        window.EveLibrary.ConnectionsAPI.promoteLinkWithData = () => {};
      }

      try {
        const singleLineLinks = [];
        const singleLineBookmark = api.processStructuredFile(
          'Cultivator Against Hero Society',
          'I-Remeber-Its-Mid.txt',
          'Straglers',
          '',
          { liveLinks: singleLineLinks, deferLibrarySave: true, silent: true }
        );

        const ledgerLinks = [];
        const ledgerBookmark = api.processStructuredFile(
          'Movie 8: Fin\nMovie 7: Fin',
          'Harry Potter  Finished _260228_000250.txt',
          'Movies',
          '',
          { liveLinks: ledgerLinks, deferLibrarySave: true, silent: true }
        );

        const titleListContent = [
          'A Cursed Sword’s Daily Life',
          'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan o Erandeiraremasen—Dai 1-bu: Hon ga Nai nara Tsukureba Ii!',
          'Akuyaku Reijou Tensei Ojisan (Pre-Serialization)',
          'Dominate the Three Realms',
          'Promise of an Orchid'
        ].join('\n');

        const punctuatedTitleListContent = [
          'The Strongest Manager in History',
          'Blazer Drive',
          'Jí\'ě Yóuxì',
          'Last Round Arthurs',
          'Path of the Sword',
          'Doryoku Shisugita Sekai Saikyou no Butouka ha, Mahou Sekai wo Yoyuu de Ikinuku.',
          'Dawn of the Eastland',
          'LESSA',
          'Chronicles of Everlasting Wind and Sword Rain'
        ].join('\n');

        const inlineUrlTitleContent = 'https://www.youtube.com/watch?v=1PlfTgkCAws | Different Kings Chapter 1 & 2 [ ENGLISH ] - YouTube';
        const inlineUrlTitleLinks = [];
        const inlineUrlTitleBookmark = api.processStructuredFile(
          inlineUrlTitleContent,
          'manga YouTube_and_Misc.txt',
          'Straglers',
          '',
          { liveLinks: inlineUrlTitleLinks, deferLibrarySave: true, silent: true }
        );

        return {
          titleListDetection: {
            structured: api.looksLikeStructuredFileContent(titleListContent, 'I-Remember-Its-Good.txt'),
            singleEntry: api.looksLikeSingleEntryBulkFile(titleListContent, 'I-Remember-Its-Good.txt')
          },
          punctuatedTitleListDetection: {
            structured: api.looksLikeStructuredFileContent(punctuatedTitleListContent, 'Looks-Good.txt'),
            singleEntry: api.looksLikeSingleEntryBulkFile(punctuatedTitleListContent, 'Looks-Good.txt')
          },
          inlineUrlTitleDetection: {
            structured: api.looksLikeStructuredFileContent(inlineUrlTitleContent, 'manga YouTube_and_Misc.txt'),
            singleEntry: api.looksLikeSingleEntryBulkFile(inlineUrlTitleContent, 'manga YouTube_and_Misc.txt')
          },
          inlineUrlTitleBookmark: {
            title: inlineUrlTitleBookmark?.title || '',
            url: inlineUrlTitleBookmark?.url || '',
            notes: inlineUrlTitleBookmark?.notes || ''
          },
          singleLineBookmark: {
            title: singleLineBookmark?.title || '',
            url: singleLineBookmark?.url || '',
            notes: singleLineBookmark?.notes || ''
          },
          ledgerBookmark: {
            title: ledgerBookmark?.title || '',
            url: ledgerBookmark?.url || '',
            notes: ledgerBookmark?.notes || ''
          }
        };
      } finally {
        if (window.EveLibrary?.ConnectionsAPI) {
          window.EveLibrary.ConnectionsAPI.promoteLinkWithData = priorPromoter;
        }
      }
    });

    if (parserCases.singleLineBookmark.title !== 'Cultivator Against Hero Society') {
      throw new Error(`Single-line smart extract title promotion failed: ${JSON.stringify(parserCases.singleLineBookmark)}`);
    }
    if (!/Cultivator%20Against%20Hero%20Society/.test(parserCases.singleLineBookmark.url)) {
      throw new Error(`Single-line smart extract URL did not follow the promoted title: ${JSON.stringify(parserCases.singleLineBookmark)}`);
    }
    if (parserCases.singleLineBookmark.notes) {
      throw new Error(`Single-line smart extract should not leave the promoted title in notes: ${JSON.stringify(parserCases.singleLineBookmark)}`);
    }
    if (parserCases.titleListDetection.structured || parserCases.titleListDetection.singleEntry) {
      throw new Error(`Title-list smart extract should stay line-per-bookmark, got ${JSON.stringify(parserCases.titleListDetection)}`);
    }
    if (parserCases.punctuatedTitleListDetection.structured || parserCases.punctuatedTitleListDetection.singleEntry) {
      throw new Error(`Punctuated title-list smart extract should stay line-per-bookmark, got ${JSON.stringify(parserCases.punctuatedTitleListDetection)}`);
    }
    if (!parserCases.inlineUrlTitleDetection.structured || !parserCases.inlineUrlTitleDetection.singleEntry) {
      throw new Error(`Inline URL+title single-entry file should be detected for Smart Extract, got ${JSON.stringify(parserCases.inlineUrlTitleDetection)}`);
    }
    if (parserCases.inlineUrlTitleBookmark.title !== 'Different Kings Chapter 1 & 2 [ ENGLISH ] - YouTube') {
      throw new Error(`Inline URL+title structured file title mismatch: ${JSON.stringify(parserCases.inlineUrlTitleBookmark)}`);
    }
    if (parserCases.inlineUrlTitleBookmark.url !== 'https://www.youtube.com/watch?v=1PlfTgkCAws') {
      throw new Error(`Inline URL+title structured file URL mismatch: ${JSON.stringify(parserCases.inlineUrlTitleBookmark)}`);
    }
    if (parserCases.inlineUrlTitleBookmark.notes) {
      throw new Error(`Inline URL+title structured file should not spill parsed data into notes: ${JSON.stringify(parserCases.inlineUrlTitleBookmark)}`);
    }
    if (parserCases.ledgerBookmark.title !== 'Harry Potter') {
      throw new Error(`Progress-ledger structured file regressed: ${JSON.stringify(parserCases.ledgerBookmark)}`);
    }
    if (!/Movie 8: Fin/.test(parserCases.ledgerBookmark.notes)) {
      throw new Error(`Progress-ledger structured file lost note lines: ${JSON.stringify(parserCases.ledgerBookmark)}`);
    }

    const leadingBlankLineImport = await page.evaluate(async () => {
      const api = window.EveBulkImport && window.EveBulkImport._api;
      if (!api || typeof api.processBulk !== 'function') {
        throw new Error('Bulk process API unavailable');
      }

      const priorLinks = typeof window.getLiveLinks === 'function'
        ? window.getLiveLinks().slice()
        : (Array.isArray(window.links) ? window.links.slice() : []);
      const priorConfig = window.config ? JSON.parse(JSON.stringify(window.config)) : {};
      const priorSaveData = window.saveData;
      const priorCloseModals = window.closeModals;
      const priorShowToast = window.showToast;
      let lastToast = null;

      window.config = window.config || {};
      config.activeWorkspace = 'main';
      config.workspaces = config.workspaces || [{ id: 'main', name: 'Main', icon: '🏠', subTabs: [] }];
      if (typeof window.setLiveLinks === 'function') {
        window.setLiveLinks([]);
      } else {
        window.links = [];
        if (window.eveState) window.eveState.links = window.links;
      }
      window.saveData = () => {};
      window.closeModals = () => {};
      window.showToast = (msg, type) => { lastToast = { msg, type }; };

      try {
        window.openBulkModal();
        document.getElementById('bulkModeFile').checked = true;
        document.getElementById('bulkSmartExtractCardPerFile').checked = true;
        if (typeof api.updateBulkModeUi === 'function') api.updateBulkModeUi();

        const text = '\nMaterial and Spiritual World\nI Fell in Love, so I Tried Livestreaming.\nThe Blue Hole\n';
        const file = new File([text], 'Really-Idk-or-Ero.txt', { type: 'text/plain', lastModified: Date.now() });
        const input = document.getElementById('bulkFileInput');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });

        await api.processBulk();

        return {
          links: (typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : window.links)
            .map((link) => ({ title: link.title, category: link.category, url: link.url })),
          toast: lastToast
        };
      } finally {
        if (typeof window.setLiveLinks === 'function') {
          window.setLiveLinks(priorLinks);
        } else {
          window.links = priorLinks;
          if (window.eveState) window.eveState.links = priorLinks;
        }
        window.config = priorConfig;
        window.saveData = priorSaveData;
        window.closeModals = priorCloseModals;
        window.showToast = priorShowToast;
      }
    });

    if (leadingBlankLineImport.links.length !== 3) {
      throw new Error(`Leading-blank-line Smart Extract import should create 3 bookmarks, got ${JSON.stringify(leadingBlankLineImport)}`);
    }
    if (leadingBlankLineImport.links.map((link) => link.title).join('|') !== 'Material and Spiritual World|I Fell in Love, so I Tried Livestreaming.|The Blue Hole') {
      throw new Error(`Leading-blank-line Smart Extract titles mismatch: ${JSON.stringify(leadingBlankLineImport)}`);
    }
    if (leadingBlankLineImport.links.some((link) => link.category !== 'Really-Idk-or-Ero')) {
      throw new Error(`Leading-blank-line Smart Extract card title mismatch: ${JSON.stringify(leadingBlankLineImport)}`);
    }
    if (!leadingBlankLineImport.toast || leadingBlankLineImport.toast.msg !== 'Imported 3 items into 1 card.') {
      throw new Error(`Leading-blank-line Smart Extract toast mismatch: ${JSON.stringify(leadingBlankLineImport)}`);
    }

    const inlineUrlTitleImport = await page.evaluate(async () => {
      const api = window.EveBulkImport && window.EveBulkImport._api;
      if (!api || typeof api.processBulk !== 'function') {
        throw new Error('Bulk process API unavailable');
      }

      const priorLinks = typeof window.getLiveLinks === 'function'
        ? window.getLiveLinks().slice()
        : (Array.isArray(window.links) ? window.links.slice() : []);
      const priorConfig = window.config ? JSON.parse(JSON.stringify(window.config)) : {};
      const priorSaveData = window.saveData;
      const priorCloseModals = window.closeModals;
      const priorShowToast = window.showToast;
      let lastToast = null;

      window.config = window.config || {};
      config.activeWorkspace = 'main';
      config.workspaces = config.workspaces || [{ id: 'main', name: 'Main', icon: 'ðŸ ', subTabs: [] }];
      if (typeof window.setLiveLinks === 'function') {
        window.setLiveLinks([]);
      } else {
        window.links = [];
        if (window.eveState) window.eveState.links = window.links;
      }
      window.saveData = () => {};
      window.closeModals = () => {};
      window.showToast = (msg, type) => { lastToast = { msg, type }; };

      try {
        window.openBulkModal();
        document.getElementById('bulkModeFile').checked = true;
        document.getElementById('bulkSmartExtractCardPerFile').checked = true;
        if (typeof api.updateBulkModeUi === 'function') api.updateBulkModeUi();

        const text = 'https://www.youtube.com/watch?v=1PlfTgkCAws | Different Kings Chapter 1 & 2 [ ENGLISH ] - YouTube';
        const file = new File([text], 'manga YouTube_and_Misc.txt', { type: 'text/plain', lastModified: Date.now() });
        const input = document.getElementById('bulkFileInput');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });

        await api.processBulk();

        return {
          links: (typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : window.links)
            .map((link) => ({ title: link.title, category: link.category, url: link.url })),
          toast: lastToast
        };
      } finally {
        if (typeof window.setLiveLinks === 'function') {
          window.setLiveLinks(priorLinks);
        } else {
          window.links = priorLinks;
          if (window.eveState) window.eveState.links = priorLinks;
        }
        window.config = priorConfig;
        window.saveData = priorSaveData;
        window.closeModals = priorCloseModals;
        window.showToast = priorShowToast;
      }
    });

    if (inlineUrlTitleImport.links.length !== 1) {
      throw new Error(`Inline URL+title Smart Extract import should create 1 bookmark, got ${JSON.stringify(inlineUrlTitleImport)}`);
    }
    if (inlineUrlTitleImport.links[0].title !== 'Different Kings Chapter 1 & 2 [ ENGLISH ] - YouTube') {
      throw new Error(`Inline URL+title Smart Extract title mismatch: ${JSON.stringify(inlineUrlTitleImport)}`);
    }
    if (inlineUrlTitleImport.links[0].url !== 'https://www.youtube.com/watch?v=1PlfTgkCAws') {
      throw new Error(`Inline URL+title Smart Extract URL mismatch: ${JSON.stringify(inlineUrlTitleImport)}`);
    }
    if (inlineUrlTitleImport.links[0].category !== 'manga YouTube_and_Misc') {
      throw new Error(`Inline URL+title Smart Extract card title mismatch: ${JSON.stringify(inlineUrlTitleImport)}`);
    }
    if (!inlineUrlTitleImport.toast || inlineUrlTitleImport.toast.msg !== 'Imported 1 items into 1 card.') {
      throw new Error(`Inline URL+title Smart Extract toast mismatch: ${JSON.stringify(inlineUrlTitleImport)}`);
    }

    console.log('MODAL_BULK_RUNTIME_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error('MODAL_BULK_RUNTIME_SMOKE_FAIL:', error && error.message ? error.message : error);
  process.exit(1);
});
