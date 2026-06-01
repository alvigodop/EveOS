const path = require('path');
const { chromium } = require('playwright');
const { assertParserCases } = require('./modal_bulk_runtime_smoke.assertions');
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
      const promotionCalls = [];
      if (window.EveLibrary?.ConnectionsAPI) {
        window.EveLibrary.ConnectionsAPI.promoteLinkWithData = (id, data) => {
          promotionCalls.push({ id, data });
        };
      }
      try {
        function parseStructured(content, fileName, category) {
          const liveLinks = [];
          const priorPromotionCount = promotionCalls.length;
          const bookmark = api.processStructuredFile(
            content,
            fileName,
            category,
            '',
            { liveLinks, deferLibrarySave: true, silent: true }
          );
          const promotion = promotionCalls.length > priorPromotionCount
            ? promotionCalls[promotionCalls.length - 1]
            : null;
          return { bookmark, promotion };
        }
        const singleLineCase = parseStructured(
          'Cultivator Against Hero Society',
          'I-Remeber-Its-Mid.txt',
          'Straglers'
        );
        const ledgerCase = parseStructured(
          'Movie 8: Fin\nMovie 7: Fin',
          'Harry Potter  Finished _260228_000250.txt',
          'Movies'
        );
        const titleListContent = [
          'A Cursed Swordâ€™s Daily Life',
          'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan o Erandeiraremasenâ€”Dai 1-bu: Hon ga Nai nara Tsukureba Ii!',
          'Akuyaku Reijou Tensei Ojisan (Pre-Serialization)',
          'Dominate the Three Realms',
          'Promise of an Orchid'
        ].join('\n');
        const punctuatedTitleListContent = [
          'The Strongest Manager in History',
          'Blazer Drive',
          'JÃ­\'Ä› YÃ³uxÃ¬',
          'Last Round Arthurs',
          'Path of the Sword',
          'Doryoku Shisugita Sekai Saikyou no Butouka ha, Mahou Sekai wo Yoyuu de Ikinuku.',
          'Dawn of the Eastland',
          'LESSA',
          'Chronicles of Everlasting Wind and Sword Rain'
        ].join('\n');
        const inlineUrlTitleContent = 'https://www.youtube.com/watch?v=1PlfTgkCAws | Different Kings Chapter 1 & 2 [ ENGLISH ] - YouTube';
        const inlineUrlTitleCase = parseStructured(
          inlineUrlTitleContent,
          'manga YouTube_and_Misc.txt',
          'Straglers'
        );
        const soloLevelingContent = [
          'Source: The Best Sites',
          'Officially ened at Ch: 184',
          '',
          'Then New Begining after End: 200',
          '',
          '2 endings'
        ].join('\n');
        const soloLevelingCase = parseStructured(
          soloLevelingContent,
          'Solo Leveling_260227_234000.txt',
          'Memorable'
        );
        const onePieceContent = 'Vol: 1';
        const onePieceCase = parseStructured(
          onePieceContent,
          'One Piece_260227_233250.txt',
          'Manga The Ultimate'
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
          soloLevelingDetection: {
            structured: api.looksLikeStructuredFileContent(soloLevelingContent, 'Solo Leveling_260227_234000.txt'),
            singleEntry: api.looksLikeSingleEntryBulkFile(soloLevelingContent, 'Solo Leveling_260227_234000.txt')
          },
          onePieceDetection: {
            structured: api.looksLikeStructuredFileContent(onePieceContent, 'One Piece_260227_233250.txt'),
            singleEntry: api.looksLikeSingleEntryBulkFile(onePieceContent, 'One Piece_260227_233250.txt')
          },
          inlineUrlTitleBookmark: {
            title: inlineUrlTitleCase.bookmark?.title || '',
            url: inlineUrlTitleCase.bookmark?.url || '',
            notes: inlineUrlTitleCase.bookmark?.notes || ''
          },
          singleLineBookmark: {
            title: singleLineCase.bookmark?.title || '',
            url: singleLineCase.bookmark?.url || '',
            notes: singleLineCase.bookmark?.notes || ''
          },
          ledgerBookmark: {
            title: ledgerCase.bookmark?.title || '',
            url: ledgerCase.bookmark?.url || '',
            notes: ledgerCase.bookmark?.notes || ''
          },
          soloLevelingBookmark: {
            title: soloLevelingCase.bookmark?.title || '',
            url: soloLevelingCase.bookmark?.url || '',
            notes: soloLevelingCase.bookmark?.notes || ''
          },
          onePieceBookmark: {
            title: onePieceCase.bookmark?.title || '',
            url: onePieceCase.bookmark?.url || '',
            notes: onePieceCase.bookmark?.notes || ''
          },
          soloLevelingPromotion: {
            chapter: soloLevelingCase.promotion?.data?.chapter || 0,
            summary: soloLevelingCase.promotion?.data?.summary || '',
            status: soloLevelingCase.promotion?.data?.status || ''
          },
          onePiecePromotion: {
            chapter: onePieceCase.promotion?.data?.chapter || 0,
            summary: onePieceCase.promotion?.data?.summary || '',
            status: onePieceCase.promotion?.data?.status || ''
          }
        };
      } finally {
        if (window.EveLibrary?.ConnectionsAPI) {
          window.EveLibrary.ConnectionsAPI.promoteLinkWithData = priorPromoter;
        }
      }
    });
    assertParserCases(parserCases);
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
      config.workspaces = config.workspaces || [{ id: 'main', name: 'Main', icon: 'Ã°Å¸ÂÂ ', subTabs: [] }];
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
    if (!/^https:\/\/(?:www\.)?youtube\.com\/watch\?v=1plftgkcaws$/i.test(inlineUrlTitleImport.links[0].url)) {
      throw new Error(`Inline URL+title Smart Extract URL mismatch: ${JSON.stringify(inlineUrlTitleImport)}`);
    }
    if (inlineUrlTitleImport.links[0].category !== 'manga YouTube_and_Misc') {
      throw new Error(`Inline URL+title Smart Extract card title mismatch: ${JSON.stringify(inlineUrlTitleImport)}`);
    }
    if (!inlineUrlTitleImport.toast || inlineUrlTitleImport.toast.msg !== 'Imported 1 items into 1 card.') {
      throw new Error(`Inline URL+title Smart Extract toast mismatch: ${JSON.stringify(inlineUrlTitleImport)}`);
    }
    const onePieceFolderCardImport = await page.evaluate(async () => {
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
        document.getElementById('bulkModeCard').checked = true;
        if (typeof api.updateBulkModeUi === 'function') api.updateBulkModeUi();
        const file = new File(['Vol: 1'], 'One Piece_260227_233250.txt', { type: 'text/plain', lastModified: Date.now() });
        file.customRelativePath = 'Manga The Ultimate/One Piece_260227_233250.txt';
        api._accumulatedFolderFiles = [file];
        api._latentCardMap = { 'Manga The Ultimate': 'Manga The Ultimate' };
        await api.processBulk();
        return {
          links: (typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : window.links)
            .map((link) => ({ title: link.title, category: link.category, notes: link.notes || '', url: link.url })),
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
    if (onePieceFolderCardImport.links.length !== 1) {
      throw new Error(`One Piece folder-card import should create 1 bookmark, got ${JSON.stringify(onePieceFolderCardImport)}`);
    }
    if (onePieceFolderCardImport.links[0].title !== 'One Piece') {
      throw new Error(`One Piece folder-card import title mismatch: ${JSON.stringify(onePieceFolderCardImport)}`);
    }
    if (onePieceFolderCardImport.links[0].category !== 'Manga The Ultimate') {
      throw new Error(`One Piece folder-card import category mismatch: ${JSON.stringify(onePieceFolderCardImport)}`);
    }
    if (onePieceFolderCardImport.links[0].notes !== 'Vol: 1') {
      throw new Error(`One Piece folder-card import notes mismatch: ${JSON.stringify(onePieceFolderCardImport)}`);
    }
    if (!onePieceFolderCardImport.toast || onePieceFolderCardImport.toast.msg !== 'Created Cards from folders and imported 1 items.') {
      throw new Error(`One Piece folder-card import toast mismatch: ${JSON.stringify(onePieceFolderCardImport)}`);
    }
    console.log('MODAL_BULK_RUNTIME_SMOKE_OK');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error('MODAL_BULK_RUNTIME_SMOKE_FAIL:', error && error.message ? error.message : error);
  process.exit(1);
});
