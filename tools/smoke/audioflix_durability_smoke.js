const path = require('path');
const { chromium } = require('playwright');
const FILE_URL = 'file:///' + path.join(path.resolve(__dirname, '..', '..'), 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} window.__eveSmokeNoAutoGemini = true; });
    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => !!window.EveAudioflixState && !!(window.EveDataStore && window.EveDataStore.Store && window.EveDataStore.Store.captureState && window.EveDataStore.Store.applyState), undefined, { timeout: 60000 });

    // 1. Seed every user-content surface that must travel with a datapack.
    await page.evaluate(() => {
        window.EveAudioflixState.addPort({ nickname: 'RTPort', path: 'C:/rt/sounds' });
        window.EveAudioflixState.addSoundboardGroup('RTGroup');
        window.EveAudioflixState.addItem('sound', { id: 'rt-sound', title: 'RT Sound', url: 'media/rt.wav', volume: 0 });
        window.EveAudioflixState.addItem('music', { id: 'rt-music', title: 'RT Music', url: 'https://example.com/watch?v=rt', volume: 0.62 });
        window.EveAudioflixState.addItem('music', { id: 'other-music', title: 'Other Music', url: 'media/other.mp3' });
        window.EveAudioflixState.addItem('music', { id: 'main-workspace-music', title: 'Main Workspace Music', url: 'media/main.mp3' });
        window.EveAudioflixState.addItem('music', { id: 'folder-music', title: 'Folder Music', url: 'media/folder.mp3' });
        window.EveAudioflixState.addItem('music', { id: 'bookmark-music', title: 'Bookmark Music', url: 'media/bookmark.mp3' });
        window.EveAudioflixState.addItem('music', { id: 'outside-folder-music', title: 'Outside Folder Music', url: 'media/outside.mp3' });
        window.EveAudioflixLinks.add(['rt-music'], {
            scopeType: 'card',
            workspaceId: 'main',
            categoryName: 'RT Card'
        }, 'music');
        window.EveAudioflixLinks.add(['other-music'], {
            scopeType: 'workspace',
            workspaceId: 'other'
        }, 'music');
        window.EveAudioflixLinks.add(['main-workspace-music'], {
            scopeType: 'workspace',
            workspaceId: 'main'
        }, 'music');
        window.EveAudioflixLinks.add(['folder-music'], {
            scopeType: 'folder',
            workspaceId: 'main',
            categoryName: 'RT Card',
            folderId: 'folder-root'
        }, 'music');
        window.EveAudioflixLinks.add(['bookmark-music'], {
            scopeType: 'bookmark',
            workspaceId: 'main',
            categoryName: 'RT Card',
            folderId: 'folder-child',
            bookmarkId: 'bookmark-child'
        }, 'music');
        window.EveAudioflixLinks.add(['outside-folder-music'], {
            scopeType: 'folder',
            workspaceId: 'main',
            categoryName: 'RT Card',
            folderId: 'folder-outside'
        }, 'music');

        const datapack = window.EveDataStore.Store.captureState();
        datapack.bookmarks.links = [
            {
                id: 'bookmark-root',
                title: 'Root Folder Bookmark',
                url: 'https://example.com/root',
                workspace: 'main',
                category: 'RT Card',
                folderId: 'folder-root'
            },
            {
                id: 'bookmark-child',
                title: 'Child Folder Bookmark',
                url: 'https://example.com/child',
                workspace: 'main',
                category: 'RT Card',
                folderId: 'folder-child'
            },
            {
                id: 'bookmark-outside',
                title: 'Outside Folder Bookmark',
                url: 'https://example.com/outside',
                workspace: 'main',
                category: 'RT Card',
                folderId: 'folder-outside'
            }
        ];
        datapack.bookmarks.folders = {
            'main::RT Card': {
                nodes: [
                    { id: 'folder-root', parentId: null, name: 'Root Folder', order: 1 },
                    { id: 'folder-child', parentId: 'folder-root', name: 'Child Folder', order: 1 },
                    { id: 'folder-outside', parentId: null, name: 'Outside Folder', order: 2 }
                ]
            }
        };
        window.EveDataStore.Store.applyState(datapack);
    });

    // 2. Capture (the backup path) -> must include routing plus sound/music content.
    const captureOk = await page.evaluate(() => {
        const cap = window.EveDataStore.Store.captureState();
        const a = cap && cap.audioflix;
        return !!(a
            && (a.ports || []).some(p => p.nickname === 'RTPort')
            && (a.soundboardGroups || []).includes('RTGroup')
            && (a.soundboard || []).some(item => item.id === 'rt-sound' && item.volume === 0)
            && (a.music || []).some(item => item.id === 'rt-music' && item.volume === 0.62)
            && (a.scopeBindings || []).some(binding => (
                binding.audioId === 'rt-music'
                && binding.scopeType === 'card'
                && binding.categoryName === 'RT Card'
            ))
            && !cap.bookmarks.config.audioflix);
    });

    // 3. Scoped backups carry only canonical items linked inside that scope. Applying one
    // merges those items/references without replacing unrelated Audioflix content.
    const scopedResult = await page.evaluate(() => {
        const original = window.EveDataStore.Store.captureState();
        const scoped = window.EveDataStore.Store.captureWorkspace('main');
        const scopedAudio = scoped.audioflix || {};
        const capturedCleanly = scopedAudio.scoped === true
            && (scopedAudio.music || []).some(item => item.id === 'rt-music')
            && !(scopedAudio.music || []).some(item => item.id === 'other-music')
            && (scopedAudio.scopeBindings || []).every(binding => binding.workspaceId === 'main');

        window.EveAudioflixState.replaceState({
            music: [{ id: 'preserved-music', title: 'Preserved Music', url: 'media/preserved.mp3' }],
            soundboard: [],
            scopeBindings: []
        }, 'scoped-smoke-wipe');
        window.EveDataStore.Store.applyWorkspaceState(scoped);
        const restored = window.EveAudioflixState.ensure();
        const passed = capturedCleanly
            && restored.music.some(item => item.id === 'rt-music')
            && restored.music.some(item => item.id === 'preserved-music')
            && restored.scopeBindings.some(binding => (
                binding.audioId === 'rt-music'
                && binding.workspaceId === 'main'
                && binding.categoryName === 'RT Card'
            ));
        const result = {
            passed,
            capturedMusic: (scopedAudio.music || []).map(item => item.id),
            capturedBindings: (scopedAudio.scopeBindings || []).map(binding => ({
                audioId: binding.audioId,
                scopeType: binding.scopeType,
                workspaceId: binding.workspaceId,
                categoryName: binding.categoryName
            })),
            restoredMusic: restored.music.map(item => item.id),
            restoredBindings: restored.scopeBindings.map(binding => ({
                audioId: binding.audioId,
                scopeType: binding.scopeType,
                workspaceId: binding.workspaceId,
                categoryName: binding.categoryName
            }))
        };
        window.EveDataStore.Store.applyState(original);
        return result;
    });

    const cardScopedResult = await page.evaluate(() => {
        const original = window.EveDataStore.Store.captureState();
        const scoped = window.EveDataStore.Store.captureCard('main', 'RT Card');
        const scopedAudio = scoped.audioflix || {};
        const capturedCleanly = scopedAudio.scoped === true
            && (scopedAudio.music || []).some(item => item.id === 'rt-music')
            && !(scopedAudio.music || []).some(item => item.id === 'main-workspace-music')
            && (scopedAudio.scopeBindings || []).every(binding => binding.scopeType !== 'workspace');

        window.EveAudioflixState.replaceState({
            music: [{ id: 'card-preserved', title: 'Card Preserved', url: 'media/card-preserved.mp3' }],
            soundboard: [],
            scopeBindings: []
        }, 'card-scoped-smoke-wipe');
        window.EveDataStore.Store.applyCardState(scoped);
        const restored = window.EveAudioflixState.ensure();
        const result = {
            passed: capturedCleanly
                && restored.music.some(item => item.id === 'rt-music')
                && restored.music.some(item => item.id === 'card-preserved')
                && restored.scopeBindings.some(binding => (
                    binding.audioId === 'rt-music'
                    && binding.scopeType === 'card'
                    && binding.workspaceId === 'main'
                    && binding.categoryName === 'RT Card'
                )),
            capturedMusic: (scopedAudio.music || []).map(item => item.id),
            restoredMusic: restored.music.map(item => item.id)
        };
        window.EveDataStore.Store.applyState(original);
        return result;
    });

    const folderScopedResult = await page.evaluate(() => {
        const original = window.EveDataStore.Store.captureState();
        const scoped = window.EveDataStore.Store.captureFolder('main', 'RT Card', 'folder-root');
        const scopedAudio = scoped.audioflix || {};
        const capturedIds = (scopedAudio.music || []).map((item) => item.id).sort();
        const capturedCleanly = scopedAudio.scoped === true
            && capturedIds.join('|') === ['bookmark-music', 'folder-music'].sort().join('|')
            && (scopedAudio.scopeBindings || []).every((binding) => (
                binding.scopeType === 'folder' || binding.scopeType === 'bookmark'
            ));

        window.EveAudioflixState.replaceState({
            music: [{ id: 'folder-preserved', title: 'Folder Preserved', url: 'media/folder-preserved.mp3' }],
            soundboard: [],
            scopeBindings: []
        }, 'folder-scoped-smoke-wipe');
        window.EveDataStore.Store.applyFolderState(scoped);
        const restored = window.EveAudioflixState.ensure();
        const result = {
            passed: capturedCleanly
                && restored.music.some((item) => item.id === 'folder-music')
                && restored.music.some((item) => item.id === 'bookmark-music')
                && restored.music.some((item) => item.id === 'folder-preserved')
                && restored.scopeBindings.some((binding) => (
                    binding.audioId === 'folder-music'
                    && binding.scopeType === 'folder'
                    && binding.folderId === 'folder-root'
                ))
                && restored.scopeBindings.some((binding) => (
                    binding.audioId === 'bookmark-music'
                    && binding.scopeType === 'bookmark'
                    && binding.bookmarkId === 'bookmark-child'
                )),
            capturedIds,
            restoredMusic: restored.music.map((item) => item.id)
        };
        window.EveDataStore.Store.applyState(original);
        return result;
    });

    const bookmarkScopedResult = await page.evaluate(() => {
        const original = window.EveDataStore.Store.captureState();
        const scoped = window.EveDataStore.Store.captureBookmark('main', 'RT Card', 'bookmark-child');
        const scopedAudio = scoped.audioflix || {};
        const capturedCleanly = scopedAudio.scoped === true
            && (scopedAudio.music || []).map((item) => item.id).join('|') === 'bookmark-music'
            && (scopedAudio.scopeBindings || []).every((binding) => (
                binding.scopeType === 'bookmark' && binding.bookmarkId === 'bookmark-child'
            ));

        window.EveAudioflixState.replaceState({
            music: [{ id: 'bookmark-preserved', title: 'Bookmark Preserved', url: 'media/bookmark-preserved.mp3' }],
            soundboard: [],
            scopeBindings: []
        }, 'bookmark-scoped-smoke-wipe');
        window.EveDataStore.Store.applyBookmarkState(scoped);
        const restored = window.EveAudioflixState.ensure();
        const result = {
            passed: capturedCleanly
                && restored.music.some((item) => item.id === 'bookmark-music')
                && restored.music.some((item) => item.id === 'bookmark-preserved')
                && restored.scopeBindings.some((binding) => (
                    binding.audioId === 'bookmark-music'
                    && binding.scopeType === 'bookmark'
                    && binding.bookmarkId === 'bookmark-child'
                )),
            capturedMusic: (scopedAudio.music || []).map((item) => item.id),
            restoredMusic: restored.music.map((item) => item.id)
        };
        window.EveDataStore.Store.applyState(original);
        return result;
    });

    // 4. Wipe Audioflix, restore the captured datapack, then verify all content returns.
    const restoreOk = await page.evaluate(() => {
        const cap = window.EveDataStore.Store.captureState();          // snapshot WITH our data
        window.EveAudioflixState.replaceState({ soundboard: [], music: [], ports: [], soundboardGroups: [] }, 'smoke-wipe');
        window.EveDataStore.Store.applyState(cap);                     // restore
        const a = window.eveState.config.audioflix || {};
        return (a.ports || []).some(p => p.nickname === 'RTPort')
            && (a.soundboardGroups || []).includes('RTGroup')
            && (a.soundboard || []).some(item => item.id === 'rt-sound')
            && (a.music || []).some(item => item.id === 'rt-music')
            && (a.scopeBindings || []).some(binding => binding.audioId === 'rt-music');
    });

    // 5. An explicitly empty Audioflix datapack must stay empty; stale fallback metadata
    // must not silently repopulate sounds or music after load.
    const clearResult = await page.evaluate(() => {
        let stopCalls = 0;
        const originalStopAll = window.EveAudioflixAudio.stopAll;
        window.EveAudioflixAudio.stopAll = async () => { stopCalls += 1; };
        const cap = window.EveDataStore.Store.captureState();
        cap.audioflix = { soundboard: [], music: [], ports: [], soundboardGroups: [], scopeBindings: [] };
        cap.bookmarks.config.audioflix = cap.audioflix;
        window.EveDataStore.Store.applyState(cap);
        const a = window.EveAudioflixState.ensure();
        window.EveAudioflixAudio.stopAll = originalStopAll;
        return {
            cleared: a.soundboard.length === 0
                && a.music.length === 0
                && a.ports.length === 0
                && a.scopeBindings.length === 0,
            stopCalls
        };
    });

    // 6. Legacy datapacks with no Audioflix key are still full-pack replacements. They must
    // clear the previous pack's clips instead of leaking them into the newly loaded pack.
    const absentClearsOk = await page.evaluate(() => {
        window.EveAudioflixState.update({
            nativeBridgeBase: 'http://127.0.0.1:9876',
            routeMode: 'manual'
        }, 'legacy-route-preserve');
        window.EveAudioflixState.addItem('sound', { id: 'leak-check', title: 'Leak Check', url: 'media/leak.wav' });
        const legacy = window.EveDataStore.Store.captureState();
        delete legacy.audioflix;
        if (legacy.bookmarks?.config) delete legacy.bookmarks.config.audioflix;
        window.EveDataStore.Store.applyState(legacy);
        const a = window.EveAudioflixState.ensure();
        return a.soundboard.length === 0
            && a.music.length === 0
            && a.ports.length === 0
            && a.scopeBindings.length === 0
            && a.nativeBridgeBase === 'http://127.0.0.1:9876'
            && a.routeMode === 'manual';
    });

    // 7. An immediate page exit must flush the pending debounce so a quick reload cannot
    // discard the last Audioflix edit.
    const pagehideFlushOk = await page.evaluate(() => {
        window.EveAudioflixState.addItem('music', { id: 'exit-save', title: 'Exit Save', url: 'media/exit-save.mp3' });
        window.dispatchEvent(new Event('pagehide'));
        const fallback = JSON.parse(localStorage.getItem('eveAudioflixFallbackState') || '{}');
        return (fallback.music || []).some((item) => item.id === 'exit-save');
    });

    await browser.close();
    const fails = [];
    if (!captureOk) fails.push('captureState() did NOT include audioflix ports/groups');
    if (!scopedResult.passed) {
        fails.push(`scoped Audioflix capture/merge leaked or replaced unrelated content: ${JSON.stringify(scopedResult)}`);
    }
    if (!cardScopedResult.passed) {
        fails.push(`card Audioflix capture/merge leaked inherited workspace content: ${JSON.stringify(cardScopedResult)}`);
    }
    if (!folderScopedResult.passed) {
        fails.push(`folder Audioflix capture/merge leaked parent or outside content: ${JSON.stringify(folderScopedResult)}`);
    }
    if (!bookmarkScopedResult.passed) {
        fails.push(`bookmark Audioflix capture/merge leaked inherited content: ${JSON.stringify(bookmarkScopedResult)}`);
    }
    if (!restoreOk) fails.push('applyState() did NOT restore audioflix ports/groups');
    if (!clearResult.cleared) fails.push('explicitly empty Audioflix state was repopulated by fallback data');
    if (clearResult.stopCalls !== 1) fails.push('datapack replacement did not stop previous Audioflix playback');
    if (!absentClearsOk) fails.push('legacy datapack without Audioflix leaked the previous pack audio');
    if (!pagehideFlushOk) fails.push('pending Audioflix edit was lost during pagehide');
    if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exit(1); }
    console.log('AUDIOFLIX_DURABILITY_RT_OK');
})().catch(e => { console.error(e); process.exit(1); });
