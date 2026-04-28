const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openEdit === 'function'
        && typeof window.saveLink === 'function'
        && !!window.EveLinkForm?.ready
        && !!window.EveLibrary?.State
        && !!window.EveLibrary?.ConnectionsAPI?.promoteLinkWithData
        && !!window.EveLibrary?.ConnectionsAPI?.updateLinkedEntry
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            const originalSaveData = window.saveData;
            const originalShowToast = window.showToast;
            const originalCloseModals = window.closeModals;
            const api = window.EveLibrary.ConnectionsAPI;
            const originalUpdateLinkedEntry = api.updateLinkedEntry;
            const updateCalls = [];

            await new Promise(resolve => setTimeout(resolve, 500));

            const testLinks = [{
                id: 'draft-link',
                title: 'Draft Link',
                url: 'https://old.example/one',
                category: 'Alpha',
                workspace: 'main',
                done: false,
                priority: '',
                sources: []
            }];
            if (typeof window.setLiveLinks === 'function') {
                window.setLiveLinks(testLinks);
            } else {
                window.links = links = testLinks;
            }
            window.config = config = Object.assign({}, window.config || {}, {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'home' }]
            });
            if (window.eveState) {
                window.eveState.links = testLinks;
                window.eveState.config = config;
            }
            window.EveLibrary.State.setAllLibraries({});
            api.setAll([]);
            api.promoteLinkWithData('draft-link', {
                chapter: 7,
                sourceUrl: 'https://old.example/one',
                summary: 'Original notes'
            }, {
                deferSave: true,
                silent: true
            });

            window.saveData = function () { };
            window.showToast = function () { };
            window.closeModals = function () {
                const modal = document.getElementById('addModal');
                if (modal) modal.style.display = 'none';
            };
            api.updateLinkedEntry = function (linkId, patch) {
                updateCalls.push({ linkId: String(linkId), patch: JSON.parse(JSON.stringify(patch || {})) });
                return originalUpdateLinkedEntry.apply(this, arguments);
            };

            try {
                window.openEdit('draft-link');

                const urlInput = document.getElementById('newUrl');
                const sourceInput = document.getElementById('libSourceUrl');
                const summaryInput = document.getElementById('libSummary');
                const chapterInput = document.getElementById('libGraphicChapter');
                if (!urlInput || !sourceInput || !summaryInput || !chapterInput) {
                    throw new Error('Expected bookmark edit/library fields to exist');
                }

                summaryInput.value = 'Draft notes typed by user';
                chapterInput.value = '42';
                urlInput.value = 'https://new.example/two';
                urlInput.dispatchEvent(new Event('input', { bubbles: true }));

                await new Promise(resolve => setTimeout(resolve, 300));

                const afterInput = {
                    updateCallCount: updateCalls.length,
                    url: urlInput.value,
                    sourceUrl: sourceInput.value,
                    summary: summaryInput.value,
                    chapter: chapterInput.value,
                    persistedSourceUrl: api.getLinkedEntry('draft-link')?.entry?.sourceUrl || ''
                };

                window.saveLink();
                await new Promise(resolve => setTimeout(resolve, 0));
                const savedEntry = api.getLinkedEntry('draft-link')?.entry || null;
                const savedLink = window.links.find(item => String(item.id) === 'draft-link') || null;

                return {
                    afterInput,
                    updateCallCountAfterSave: updateCalls.length,
                    savedEntry,
                    savedLink
                };
            } finally {
                api.updateLinkedEntry = originalUpdateLinkedEntry;
                window.saveData = originalSaveData;
                window.showToast = originalShowToast;
                window.closeModals = originalCloseModals;
            }
        });

        if (result.afterInput.updateCallCount !== 0) {
            throw new Error(`Expected URL typing to avoid linked-entry writes, saw ${result.afterInput.updateCallCount}`);
        }
        if (result.afterInput.sourceUrl !== 'https://new.example/two') {
            throw new Error(`Expected Source URL draft to mirror bookmark URL, saw ${result.afterInput.sourceUrl}`);
        }
        if (result.afterInput.summary !== 'Draft notes typed by user') {
            throw new Error(`Expected notes draft to survive URL edit, saw ${result.afterInput.summary}`);
        }
        if (result.afterInput.chapter !== '42') {
            throw new Error(`Expected chapter draft to survive URL edit, saw ${result.afterInput.chapter}`);
        }
        if (result.afterInput.persistedSourceUrl !== 'https://old.example/one') {
            throw new Error(`Expected linked entry source URL to wait until Save, saw ${result.afterInput.persistedSourceUrl}`);
        }
        if (!result.savedEntry || result.savedEntry.sourceUrl !== 'https://new.example/two') {
            throw new Error(`Expected Save to persist new Source URL, saw ${JSON.stringify(result.savedEntry)}`);
        }
        if (Number(result.savedEntry.graphicChapter || result.savedEntry.chapter || 0) !== 42) {
            throw new Error(`Expected Save to persist draft chapter 42, saw ${JSON.stringify(result.savedEntry)}`);
        }
        if (result.savedEntry.summary !== 'Draft notes typed by user') {
            throw new Error(`Expected Save to persist draft notes, saw ${JSON.stringify(result.savedEntry)}`);
        }
        if (!result.savedLink || result.savedLink.url !== 'https://new.example/two') {
            throw new Error(`Expected bookmark URL to save, saw ${JSON.stringify(result.savedLink)}`);
        }

        console.log('BOOKMARK_EDIT_URL_DRAFT_SYNC_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
