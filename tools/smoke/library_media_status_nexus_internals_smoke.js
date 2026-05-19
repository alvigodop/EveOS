const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openEdit === 'function'
        && !!window.EveLinkForm?.ready
        && !!window.EveLibrary?.State?.getStatusOptionsForMediaTypes
        && !!window.EveLibrary?.ConnectionsAPI?.promoteLinkWithData
        && !!window.EveLibrary?.ConnectionsAPI?.updateLinkedEntry
        && !!window.EveOS?.SearchAdvanced?.DatapackView?.openCardInternals
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
            const originalSaveLibrary = window.EveLibrary.Storage?.saveLibrary;
            const originalSaveConnections = window.EveLibrary.ConnectionsCore?.saveConnections;

            window.saveData = function () { };
            if (window.EveLibrary.Storage) window.EveLibrary.Storage.saveLibrary = function () { };
            if (window.EveLibrary.ConnectionsCore) window.EveLibrary.ConnectionsCore.saveConnections = function () { return true; };

            try {
                const filmLink = {
                    id: 'film-link',
                    title: 'Nebula Show',
                    url: 'https://example.test/show/1',
                    workspace: 'main',
                    category: 'Films Card',
                    done: false
                };
                const plainLink = {
                    id: 'plain-link',
                    title: 'Plain Bookmark',
                    url: 'https://example.test/plain',
                    workspace: 'main',
                    category: 'Films Card',
                    done: false,
                    notes: 'plain bookmark notes should not be editable here'
                };
                window.links = links = [filmLink, plainLink];
                window.bookmarkFolders = bookmarkFolders = {};
                window.config = config = Object.assign({}, window.config || {}, {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
                    categoryOrderByWorkspace: { main: ['Films Card'] },
                    categoryOrder: ['Films Card']
                });
                if (window.eveState) {
                    window.eveState.links = links;
                    window.eveState.config = config;
                    window.eveState.bookmarkFolders = bookmarkFolders;
                }

                window.EveLibrary.State.setAllLibraries({
                    'main::Films Card': { dataType: 'graphicNovels', entries: [] }
                });
                window.EveLibrary.ConnectionsAPI.setAll([]);
                window.EveLibrary.ConnectionsAPI.promoteLinkWithData('film-link', {
                    mediaTypes: ['films'],
                    status: 'Watching',
                    season: 2,
                    episode: 8,
                    sourceUrl: 'https://example.test/show/1',
                    title: 'Nebula Show'
                }, {
                    deferSave: true,
                    silent: true
                });
                window.EveLibrary.ConnectionsAPI.updateLinkedEntry('film-link', {
                    mediaTypes: ['films'],
                    status: 'Watching',
                    season: 2,
                    episode: 8,
                    sourceStatus: 'Ongoing',
                    rating: '5',
                    language: 'Korean',
                    genre: 'Action, Adventure',
                    tags: ['show', 'tracked'],
                    derivedRatings: {
                        apiAverage10: 8.1,
                        hybrid10: 8.4,
                        confidence: 0.72
                    }
                });

                window.openEdit('film-link');
                const statusSelect = document.getElementById('libStatus');
                const typeFilms = document.getElementById('libTypeFilms');
                const optionsAfterEdit = Array.from(statusSelect.options).map(option => option.value);
                const selectedAfterEdit = statusSelect.value;
                const seasonVisible = document.getElementById('libSeasonWrap')?.style.display !== 'none';
                const episodeVisible = document.getElementById('libEpisodeWrap')?.style.display !== 'none';

                typeFilms.checked = true;
                document.getElementById('libTypeGraphic').checked = false;
                typeFilms.dispatchEvent(new Event('change', { bubbles: true }));
                const optionsAfterFilmToggle = Array.from(statusSelect.options).map(option => option.value);

                window.EveOS.SearchAdvanced.DatapackView.openCardInternals('main', 'Films Card');
                const overlay = document.querySelector('.nx-dv-micro-overlay');
                const text = overlay?.textContent || '';
                const librarySummary = overlay?.querySelector('.nx-dv-library-editor')?.textContent || '';
                const plainRow = overlay?.querySelector('[data-link-id="plain-link"]');
                const plainHasNotesEditor = !!plainRow?.querySelector('[data-nx-dv-field="bookmarkNotes"]');
                const libraryStatusInput = overlay?.querySelector('[data-link-id="film-link"] [data-nx-dv-library-field="status"]');
                const libraryEpisodeInput = overlay?.querySelector('[data-link-id="film-link"] [data-nx-dv-library-field="episode"]');
                if (libraryStatusInput) libraryStatusInput.value = 'Completed';
                if (libraryEpisodeInput) libraryEpisodeInput.value = '12';
                window.EveOS.SearchAdvanced.DatapackView.saveMicroChanges(overlay);
                const updated = window.EveLibrary.ConnectionsAPI.getLinkedEntry('film-link')?.entry || {};

                return {
                    optionsAfterEdit,
                    selectedAfterEdit,
                    optionsAfterFilmToggle,
                    seasonVisible,
                    episodeVisible,
                    text,
                    librarySummary,
                    plainHasNotesEditor,
                    updatedStatus: updated.status,
                    updatedEpisode: updated.episode
                };
            } finally {
                window.saveData = originalSaveData;
                if (window.EveLibrary.Storage) window.EveLibrary.Storage.saveLibrary = originalSaveLibrary;
                if (window.EveLibrary.ConnectionsCore) window.EveLibrary.ConnectionsCore.saveConnections = originalSaveConnections;
            }
        });

        if (!result.optionsAfterEdit.includes('Watching') || !result.optionsAfterEdit.includes('Plan to Watch')) {
            throw new Error(`Edit modal did not expose film/show statuses: ${JSON.stringify(result.optionsAfterEdit)}`);
        }
        if (result.selectedAfterEdit !== 'Watching') {
            throw new Error(`Edit modal did not preserve linked film status: ${JSON.stringify(result)}`);
        }
        if (!result.optionsAfterFilmToggle.includes('Watching') || result.optionsAfterFilmToggle.includes('Plan to Read')) {
            throw new Error(`Film media toggle did not switch status options cleanly: ${JSON.stringify(result.optionsAfterFilmToggle)}`);
        }
        if (!result.seasonVisible || !result.episodeVisible) {
            throw new Error(`Film progress fields should be visible: ${JSON.stringify(result)}`);
        }
        if (!result.librarySummary.includes('Films / Shows') || !result.librarySummary.includes('Watching')) {
            throw new Error(`Nexus card internals did not render library status/type: ${JSON.stringify(result.librarySummary)}`);
        }
        if (!result.librarySummary.includes('Season 2') || !result.librarySummary.includes('Episode 8')) {
            throw new Error(`Nexus card internals did not render library progress: ${JSON.stringify(result.librarySummary)}`);
        }
        if (!result.librarySummary.includes('Unified') || !result.librarySummary.includes('Confidence')) {
            throw new Error(`Nexus card internals did not render library rating values: ${JSON.stringify(result.librarySummary)}`);
        }
        if (result.plainHasNotesEditor) {
            throw new Error(`Nexus card internals should not expose bookmark notes editor for non-library bookmarks: ${JSON.stringify(result)}`);
        }
        if (result.updatedStatus !== 'Completed' || Number(result.updatedEpisode) !== 12) {
            throw new Error(`Nexus card internals did not save linked library edits: ${JSON.stringify(result)}`);
        }

        console.log('LIBRARY_MEDIA_STATUS_NEXUS_INTERNALS_SMOKE_OK ' + JSON.stringify({
            selectedAfterEdit: result.selectedAfterEdit,
            librarySummary: result.librarySummary,
            updatedStatus: result.updatedStatus,
            updatedEpisode: result.updatedEpisode
        }));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
