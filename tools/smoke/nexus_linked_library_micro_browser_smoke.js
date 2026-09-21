const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openExpandedSearchModal === 'function'
        && typeof window.renderDashboard === 'function'
        && !!window.EveOS?.SearchAdvanced?.DatapackView?.openCardInternals
        && !!window.EveOS?.NebulaJsonPatch
        && !!window.EveLibrary?.State
        && !!window.EveLibrary?.Storage
        && !!window.EveLibrary?.ConnectionsAPI?.promoteLinkWithData
        && !!window.EveLibrary?.ConnectionsAPI?.getLinkedEntry
    ), undefined, { timeout: 180000 });
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error && error.message ? error.message : String(error));
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const seed = await page.evaluate(async () => {
            const categoryName = 'Linked Micro';
            const linkId = '__nexus_linked_library_micro__';
            const nextConfig = Object.assign({}, window.eveState?.config || {}, {
                activeWorkspace: 'main',
                viewMode: 'grid',
                workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
                categoryOrder: [categoryName],
                categoryOrderByWorkspace: { main: [categoryName] },
                collapsed: [],
                collapsedTabs: [],
                foldersCollapsed: [],
                linksCollapsed: [],
                hideStats: []
            });
            window.eveState.config = nextConfig;
            window.eveState.links = [{
                id: linkId,
                title: 'Linked Bookmark Seed',
                url: 'https://example.com/bookmark-seed',
                workspace: 'main',
                category: categoryName,
                notes: 'Bookmark seed note',
                identifiers: ['reading']
            }];
            window.eveState.bookmarkFolders = {};
            window.EveLibrary.State.setAllLibraries({});
            window.EveLibrary.ConnectionsCore?.invalidateEntryIndex?.();
            await Promise.resolve(window.EveLibrary.ConnectionsAPI.setAll([], { immediate: true }));

            const connection = window.EveLibrary.ConnectionsAPI.promoteLinkWithData(linkId, {
                title: 'Library Seed Title',
                mediaTypes: ['graphicNovels'],
                status: 'Reading',
                chapter: 3,
                sourceUrl: 'https://example.com/bookmark-seed',
                summary: 'Library seed summary'
            }, {
                deferSave: true,
                silent: true
            });
            if (!connection) throw new Error('Failed to create linked Library seed connection');

            window.renderDashboard();
            const linked = window.EveLibrary.ConnectionsAPI.getLinkedEntry(linkId);
            return {
                linkId,
                categoryName,
                connection: linked?.connection || null,
                entry: linked?.entry || null,
                liveLink: window.eveState.links.find((link) => String(link?.id) === linkId) || null
            };
        });

        assert(seed.connection, `Linked Library seed connection missing: ${JSON.stringify(seed)}`);
        assert(seed.entry?.title === 'Library Seed Title', `Linked Library seed entry missing: ${JSON.stringify(seed)}`);
        assert(seed.liveLink?.notes === 'Bookmark seed note', `Bookmark seed note missing: ${JSON.stringify(seed.liveLink)}`);

        await page.evaluate(() => window.openExpandedSearchModal({ autoSearch: false }));
        await page.waitForSelector('#expandedSearchModal', { timeout: 10000 });
        await page.evaluate((seedState) => {
            window.EveOS.SearchAdvanced.DatapackView.openCardInternals('main', seedState.categoryName);
        }, seed);
        await page.waitForSelector('.nx-dv-micro-overlay', { timeout: 10000 });
        await page.waitForSelector(`.nx-dv-bookmark-row[data-link-id="${seed.linkId}"]`, { timeout: 10000 });

        const initial = await page.evaluate((linkId) => {
            const row = document.querySelector(`.nx-dv-bookmark-row[data-link-id="${linkId}"]`);
            if (!row) return { missingRow: true };
            const notes = row.querySelector('[data-nx-dv-field="bookmarkNotes"]');
            const editor = row.querySelector('[data-nx-dv-library-entry-id]');
            return {
                missingRow: false,
                hasNotesEditor: !!notes,
                notes: notes?.value || '',
                hasLibraryEditor: !!editor,
                libraryEntryId: editor?.getAttribute('data-nx-dv-library-entry-id') || '',
                libraryTitle: row.querySelector('[data-nx-dv-library-field="title"]')?.value || '',
                libraryStatus: row.querySelector('[data-nx-dv-library-field="status"]')?.value || '',
                librarySummary: row.querySelector('[data-nx-dv-library-field="summary"]')?.value || ''
            };
        }, seed.linkId);

        assert(!initial.missingRow, 'Linked bookmark row should render');
        assert(initial.hasNotesEditor, `Linked bookmark should expose editable notes: ${JSON.stringify(initial)}`);
        assert(initial.hasLibraryEditor, `Linked bookmark should expose Library editor: ${JSON.stringify(initial)}`);
        assert(initial.notes === 'Bookmark seed note', `Unexpected initial bookmark note: ${JSON.stringify(initial)}`);
        assert(initial.libraryTitle === 'Library Seed Title', `Unexpected initial Library title: ${JSON.stringify(initial)}`);
        assert(initial.libraryStatus === 'Reading', `Unexpected initial Library status: ${JSON.stringify(initial)}`);

        await page.evaluate((linkId) => {
            const row = document.querySelector(`.nx-dv-bookmark-row[data-link-id="${linkId}"]`);
            if (!row) throw new Error('Linked bookmark row disappeared before edit');
            const setValue = (selector, value) => {
                const field = row.querySelector(selector);
                if (!field) throw new Error('Missing linked Library micro field: ' + selector);
                field.value = value;
            };
            setValue('[data-nx-dv-field="bookmarkNotes"]', 'Bookmark note edited through Nexus micro');
            setValue('[data-nx-dv-library-field="title"]', 'Library Title Edited');
            setValue('[data-nx-dv-library-field="sourceUrl"]', 'https://example.com/library-edited');
            setValue('[data-nx-dv-library-field="status"]', 'Completed');
            setValue('[data-nx-dv-library-field="chapter"]', '27');
            setValue('[data-nx-dv-library-field="tags"]', 'alpha, beta');
            setValue('[data-nx-dv-library-field="summary"]', 'Library summary edited through Nexus micro');
            const preview = document.querySelector('[data-nx-dv-action="preview-micro"]');
            if (!preview) throw new Error('Missing linked Library micro preview action');
            preview.click();
        }, seed.linkId);

        await page.waitForFunction(() => {
            const diff = document.querySelector('[data-nx-dv-diff="micro"]');
            return !!(diff && !diff.hidden
                && diff.textContent.includes('set-bookmark-notes')
                && diff.textContent.includes('set-linked-library-fields'));
        }, undefined, { timeout: 10000 });

        await page.evaluate(() => {
            const save = document.querySelector('[data-nx-dv-action="save-micro"]');
            if (!save) throw new Error('Missing linked Library micro save action');
            save.click();
        });
        await page.waitForFunction(() => !document.querySelector('.nx-dv-micro-overlay'), undefined, { timeout: 10000 });

        const result = await page.evaluate((linkId) => {
            const linked = window.EveLibrary.ConnectionsAPI.getLinkedEntry(linkId);
            const liveLink = window.eveState.links.find((link) => String(link?.id) === linkId) || null;
            const tx = window.EveOS?.SearchAdvanced?._lastDatapackMicroTransaction || null;
            return {
                liveLink,
                connection: linked?.connection || null,
                entry: linked?.entry || null,
                transactionOk: tx?.result?.ok === true,
                transactionApplied: tx?.result?.applied === true
            };
        }, seed.linkId);

        assert(result.transactionOk && result.transactionApplied, `Linked Library micro transaction failed: ${JSON.stringify(result)}`);
        assert(result.liveLink?.notes === 'Bookmark note edited through Nexus micro', `Bookmark-local note did not persist: ${JSON.stringify(result.liveLink)}`);
        assert(result.liveLink?.title === 'Library Title Edited', `Library title did not sync back to bookmark: ${JSON.stringify(result.liveLink)}`);
        assert(result.liveLink?.url === 'https://example.com/library-edited', `Library source URL did not sync back to bookmark: ${JSON.stringify(result.liveLink)}`);
        assert(result.entry?.title === 'Library Title Edited', `Library title did not persist: ${JSON.stringify(result.entry)}`);
        assert(result.entry?.sourceUrl === 'https://example.com/library-edited', `Library source URL did not persist: ${JSON.stringify(result.entry)}`);
        assert(result.entry?.status === 'Completed', `Library status did not persist: ${JSON.stringify(result.entry)}`);
        assert(Number(result.entry?.chapter || 0) === 27, `Library chapter did not persist: ${JSON.stringify(result.entry)}`);
        assert(Array.isArray(result.entry?.tags) && result.entry.tags.join('|') === 'alpha|beta', `Library tags did not normalize/persist: ${JSON.stringify(result.entry)}`);
        assert(result.entry?.summary === 'Library summary edited through Nexus micro', `Library summary did not persist: ${JSON.stringify(result.entry)}`);
        assert(result.connection?.workspace === 'main' && result.connection?.categoryName === seed.categoryName,
            `Linked Library connection scope drifted: ${JSON.stringify(result.connection)}`);
        assert(!pageErrors.length, `Page errors during linked Library micro smoke: ${pageErrors.join(' | ')}`);

        console.log('NEXUS_LINKED_LIBRARY_MICRO_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
