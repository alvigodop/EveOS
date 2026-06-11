const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { launchChromiumOrConnect } = require('./playwright-browser');
const {
    REPO_ROOT,
    getFreePort,
    waitForStatus,
    seedDatapack,
    seedLargeDatapack
} = require('./matrix_datapack_phone_browser_smoke.fixtures');
const { runScopeScaleDetach } = require('./matrix_datapack_phone_browser_smoke.scope');

(async () => {
    const port = await getFreePort();
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-matrix-phone-store-'));
    const server = spawn('python', [
        'python-server.py',
        String(port),
        '--no-browser',
        '--modular-root',
        modularRoot
    ], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverOutput = '';
    server.stdout.on('data', (chunk) => { serverOutput += String(chunk); });
    server.stderr.on('data', (chunk) => { serverOutput += String(chunk); });
    let browser = null;
    let context = null;

    try {
        await waitForStatus(`http://127.0.0.1:${port}/api/status`);
        ({ browser } = await launchChromiumOrConnect({ headless: true }));
        context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}/EveOS.html`, {
            waitUntil: 'load',
            timeout: 180000
        });
        await page.locator('.topbar-matrix-btn').waitFor({ state: 'visible', timeout: 180000 });
        await page.waitForFunction(() => (
            !!window.EveLibrary?.State?.setAllLibraries
            && !!window.EveLibrary?.ConnectionsAPI?.setAll
            && window.__eveCoreDataLoaded === true
            && typeof window.setLiveLinks === 'function'
        ), null, { timeout: 180000 });
        await seedDatapack(page);
        await page.locator('.topbar-matrix-btn').click();

        const frame = page.frameLocator('#matrix-workshop-frame');
        await frame.locator('#datapackPhoneCheckbox').waitFor({ state: 'attached', timeout: 30000 });
        await frame.locator('#toggleToolbar').click();
        await frame.locator('#widgets-section .section-header').click();
        await frame.locator('#datapackPhoneCheckbox').check();
        await frame.locator('#eveDatapackPhoneWidget').waitFor({ state: 'visible', timeout: 30000 });
        await frame.locator('[data-phone-connection]').filter({
            hasText: 'EVE LINK'
        }).waitFor({ state: 'visible', timeout: 30000 });
        await frame.getByText('5 bookmarks', {
            exact: true
        }).waitFor({ state: 'visible', timeout: 30000 });

        const homeState = await frame.locator('#eveDatapackPhoneWidget').evaluate((widget) => ({
            connected: widget.querySelector('[data-phone-connection]')?.textContent,
            copy: widget.textContent,
            appCount: widget.querySelectorAll('.eve-matrix-phone-grid--home .eve-matrix-phone-app').length
        }));
        const initialScope = await page.evaluate(() => window.EveMatrixWorkshop.getScope());
        if (
            homeState.connected !== 'EVE LINK'
            || !homeState.copy.includes('5 bookmarks')
            || !homeState.copy.includes('3 tabs / 3 cards')
            || !homeState.copy.includes('Alpha Tab / Tab Scope')
            || homeState.appCount !== 2
            || initialScope.scope !== 'workspace'
            || initialScope.workspaceId !== 'alpha'
        ) {
            throw new Error(`Phone home mismatch: ${JSON.stringify({ homeState, initialScope })}`);
        }

        await frame.getByText('Datapack Matrix', { exact: true }).click();
        const scopedTabNames = await frame.locator('.eve-matrix-phone-app strong').allTextContents();
        if (scopedTabNames.includes('Beta Tab') || !scopedTabNames.includes('Beta Shortcut')) {
            throw new Error(`Topbar Matrix scope mismatch: ${JSON.stringify(scopedTabNames)}`);
        }
        const tabIconShape = await frame.locator('.eve-matrix-phone-app--tab .eve-matrix-phone-app-icon').first().evaluate((node) => ({
            radius: getComputedStyle(node).borderRadius,
            width: getComputedStyle(node).width
        }));
        if (tabIconShape.radius === '50%' || Number.parseFloat(tabIconShape.radius) > 12) {
            throw new Error(`Tab icon was not rendered as a rounded square: ${JSON.stringify(tabIconShape)}`);
        }
        await frame.getByText('Beta Shortcut', { exact: true }).click();
        await frame.getByText('Novels', { exact: true }).click();
        await frame.getByText('Beta Shelf', { exact: true }).click();
        await frame.getByText('Library Cover', { exact: true }).waitFor({
            state: 'visible',
            timeout: 30000
        });
        await frame.locator('[data-phone-home]').click();
        await frame.getByText('Datapack Matrix', { exact: true }).click();
        await frame.getByText('Alpha Tab', { exact: true }).click();
        await frame.getByText('Reading', { exact: true }).click();
        const matrixRootItems = await frame.locator('.eve-matrix-phone-app strong').allTextContents();
        if (
            !matrixRootItems.includes('Favorites')
            || !matrixRootItems.includes('Beta Chronicle')
            || matrixRootItems.includes('Alpha Hero')
        ) {
            throw new Error(`Datapack root hierarchy mismatch: ${JSON.stringify(matrixRootItems)}`);
        }
        const rootTileTypes = await frame.locator('.eve-matrix-phone-app').evaluateAll((nodes) => (
            nodes.map((node) => ({
                label: node.querySelector('strong')?.textContent || '',
                folder: node.classList.contains('eve-matrix-phone-app--folder'),
                bookmark: node.classList.contains('eve-matrix-phone-app--bookmark')
            }))
        ));
        const favoritesTile = rootTileTypes.find((item) => item.label === 'Favorites');
        const betaTile = rootTileTypes.find((item) => item.label === 'Beta Chronicle');
        if (!favoritesTile?.folder || !betaTile?.bookmark) {
            throw new Error(`Folder/bookmark tile distinction missing: ${JSON.stringify(rootTileTypes)}`);
        }
        await frame.getByText('Favorites', { exact: true }).click();
        const favoritesItems = await frame.locator('.eve-matrix-phone-app strong').allTextContents();
        if (!favoritesItems.includes('Alpha Hero') || !favoritesItems.includes('Archive Shelf')) {
            throw new Error(`First folder hierarchy mismatch: ${JSON.stringify(favoritesItems)}`);
        }
        await frame.getByText('Alpha Hero', { exact: true }).click();
        const enrichedBookmarkDetail = await frame.locator('.eve-matrix-phone-detail').evaluate((node) => ({
            text: node.textContent || '',
            notes: node.querySelector('[data-phone-edit-field="personalNotes"]')?.value || '',
            factCount: node.querySelectorAll('.eve-matrix-phone-detail-facts > div').length,
            relatedLabels: Array.from(node.querySelectorAll('.eve-matrix-phone-related-link strong')).map((item) => item.textContent),
            editableFields: Array.from(node.querySelectorAll('[data-phone-edit-field]')).map((item) => item.dataset.phoneEditField),
            editableValues: Object.fromEntries(Array.from(node.querySelectorAll('[data-phone-edit-field]')).map((item) => [
                item.dataset.phoneEditField,
                item.value
            ])),
            tagLabels: Array.from(node.querySelectorAll('.eve-matrix-phone-tags button')).map((item) => item.textContent),
            saveDisabled: !!node.querySelector('.eve-matrix-phone-edit-save')?.disabled,
            hasMiniFocusLabel: (node.textContent || '').includes('MINI FOCUS')
        }));
        for (const expected of ['Reading', 'Hero Alpha', 'Alfa no Eiyuu']) {
            if (!enrichedBookmarkDetail.text.includes(expected)) {
                throw new Error(`Bookmark detail missing ${expected}: ${JSON.stringify(enrichedBookmarkDetail)}`);
            }
        }
        if (
            !enrichedBookmarkDetail.notes.includes('Personal note with real spaces.')
            || enrichedBookmarkDetail.text.includes('Bookmark Merge')
            || enrichedBookmarkDetail.text.includes('Old Alpha Hero')
            || enrichedBookmarkDetail.text.includes('Rating')
            || enrichedBookmarkDetail.factCount !== 1
            || !enrichedBookmarkDetail.relatedLabels.includes('Mirror Reader')
            || !enrichedBookmarkDetail.relatedLabels.includes('Series Wiki')
            || !enrichedBookmarkDetail.editableFields.includes('chapter')
            || !enrichedBookmarkDetail.editableFields.includes('personalNotes')
            || enrichedBookmarkDetail.editableFields.includes('status')
            || enrichedBookmarkDetail.editableValues.chapter !== '42'
            || enrichedBookmarkDetail.editableValues.season !== '2'
            || enrichedBookmarkDetail.editableValues.episode !== '7'
            || !enrichedBookmarkDetail.tagLabels.includes('Fantasy')
            || !enrichedBookmarkDetail.tagLabels.includes('Hero')
            || !enrichedBookmarkDetail.saveDisabled
            || enrichedBookmarkDetail.hasMiniFocusLabel
        ) {
            throw new Error(`Bookmark detail data projection mismatch: ${JSON.stringify(enrichedBookmarkDetail)}`);
        }
        await frame.locator('[data-phone-edit-field="chapter"]').fill('71');
        await frame.locator('[data-phone-edit-field="personalNotes"]').fill('Phone note changed with real spaces.');
        await frame.locator('[data-phone-action^="save-bookmark"]').click();
        await page.waitForFunction(() => {
            const linked = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.('cover-main');
            const link = window.getLiveLinks?.().find((item) => item.id === 'cover-main');
            return linked?.entry?.chapter === 71
                && linked.entry.graphicChapter === 71
                && linked.entry.summary.includes('Phone note changed with real spaces.')
                && linked.entry.summary.includes('=== Bookmark Merge ===')
                && link?.chapter === 71
                && link?.graphicChapter === 71
                && link?.notes?.includes('Phone note changed with real spaces.')
                && link.notes.includes('=== Bookmark Merge ===');
        }, null, { timeout: 30000 });
        await frame.locator('[data-phone-edit-field="chapter"]').waitFor({
            state: 'visible',
            timeout: 30000
        });
        const savedPhoneEdit = await frame.locator('.eve-matrix-phone-edit-form').evaluate((form) => ({
            chapter: form.querySelector('[data-phone-edit-field="chapter"]')?.value || '',
            notes: form.querySelector('[data-phone-edit-field="personalNotes"]')?.value || ''
        }));
        if (savedPhoneEdit.chapter !== '71' || savedPhoneEdit.notes !== 'Phone note changed with real spaces.') {
            throw new Error(`Phone editor did not refresh saved values: ${JSON.stringify(savedPhoneEdit)}`);
        }
        await frame.getByText('Fantasy', { exact: true }).click();
        await frame.getByText('Tag / Fantasy', { exact: true }).waitFor({
            state: 'visible',
            timeout: 30000
        });
        const fantasyCoverBookmarks = await frame.locator(
            '.eve-matrix-phone-grid--covers .eve-matrix-phone-app strong'
        ).allTextContents();
        if (
            fantasyCoverBookmarks.length !== 2
            || !fantasyCoverBookmarks.includes('Alpha Hero')
            || !fantasyCoverBookmarks.includes('Beta Chronicle')
        ) {
            throw new Error(`Clickable tag Cover Atlas scope mismatch: ${JSON.stringify(fantasyCoverBookmarks)}`);
        }
        await frame.locator('[data-phone-back]').click();
        await frame.locator('.eve-matrix-phone-edit-form').waitFor({
            state: 'visible',
            timeout: 30000
        });
        const messageBridgeEdit = await frame.locator('body').evaluate(async () => {
            const host = window.parent;
            const capture = host.EveMatrixWorkshop.captureDatapackSnapshot;
            delete host.EveMatrixWorkshop.captureDatapackSnapshot;
            try {
                return await window.EveMatrixDatapackPhoneBridge.updateBookmark('cover-main', {
                    chapter: 72,
                    personalNotes: 'Message bridge note with spaces.'
                });
            } finally {
                host.EveMatrixWorkshop.captureDatapackSnapshot = capture;
            }
        });
        if (!messageBridgeEdit?.ok) {
            throw new Error(`File-safe message update failed: ${JSON.stringify(messageBridgeEdit)}`);
        }
        const unlinkedEdit = await page.evaluate(() => (
            window.EveMatrixWorkshop.updateDatapackBookmark('plain', {
                chapter: 3,
                personalNotes: 'Unlinked phone note with spaces.'
            })
        ));
        if (!unlinkedEdit?.ok || unlinkedEdit.linked) {
            throw new Error(`Unlinked bookmark update failed: ${JSON.stringify(unlinkedEdit)}`);
        }
        const mutationState = await page.evaluate(() => {
            const linked = window.EveLibrary.ConnectionsAPI.getLinkedEntry('cover-main');
            const links = window.getLiveLinks();
            const linkedBookmark = links.find((item) => item.id === 'cover-main');
            const plainBookmark = links.find((item) => item.id === 'plain');
            return {
                linkedChapter: linked?.entry?.chapter,
                linkedSummary: linked?.entry?.summary || '',
                linkedNotes: linkedBookmark?.notes || '',
                plainChapter: plainBookmark?.chapter,
                plainNotes: plainBookmark?.notes || ''
            };
        });
        if (
            mutationState.linkedChapter !== 72
            || !mutationState.linkedSummary.includes('Message bridge note with spaces.')
            || !mutationState.linkedSummary.includes('=== Bookmark Merge ===')
            || !mutationState.linkedNotes.includes('Message bridge note with spaces.')
            || mutationState.plainChapter !== 3
            || mutationState.plainNotes !== 'Unlinked phone note with spaces.'
        ) {
            throw new Error(`Bookmark mutation state mismatch: ${JSON.stringify(mutationState)}`);
        }
        await frame.locator('[data-phone-back]').click();
        await frame.getByText('Archive Shelf', { exact: true }).click();
        await frame.getByText('Nested Tale', { exact: true }).waitFor({
            state: 'visible',
            timeout: 30000
        });

        await frame.locator('[data-phone-home]').click();
        await frame.getByText('Cover Atlas', { exact: true }).click();
        const coverScopes = await frame.locator('.eve-matrix-phone-app strong').allTextContents();
        for (const expected of ['All Covers', 'Additional', 'By Tab', 'By Card', 'By Folder', 'By Letter', 'By Status', 'By Tag']) {
            if (!coverScopes.includes(expected)) {
                throw new Error(`Missing cover scope ${expected}: ${JSON.stringify(coverScopes)}`);
            }
        }

        await frame.getByText('By Folder', { exact: true }).click();
        await frame.getByText('Favorites / Reading', { exact: true }).click();
        await frame.getByText('Alpha Hero', { exact: true }).waitFor({
            state: 'visible',
            timeout: 30000
        });
        await frame.locator('[data-phone-home]').click();
        await frame.getByText('Cover Atlas', { exact: true }).click();
        await frame.getByText('All Covers', { exact: true }).click();
        const coveredBookmarks = await frame.locator('.eve-matrix-phone-grid--covers .eve-matrix-phone-app strong').allTextContents();
        if (
            coveredBookmarks.length !== 3
            || !coveredBookmarks.includes('Alpha Hero')
            || !coveredBookmarks.includes('Beta Chronicle')
            || !coveredBookmarks.includes('Library Cover')
        ) {
            throw new Error(`Cover list mismatch: ${JSON.stringify(coveredBookmarks)}`);
        }

        await frame.getByText('PLAY THIS SCOPE', { exact: true }).click();
        const slideshowState = await frame.locator('.eve-matrix-phone-slideshow').evaluate((node) => ({
            image: node.querySelector('img')?.getAttribute('src') || '',
            title: node.querySelector('strong')?.textContent || '',
            mainControls: node.querySelectorAll('.eve-matrix-phone-slide-main-controls button').length,
            optionControls: node.querySelectorAll('.eve-matrix-phone-slide-options button').length,
            thumbs: node.querySelectorAll('.eve-matrix-phone-slide-thumb').length,
            hasOpacity: !!node.querySelector('[data-phone-slide-opacity]')
        }));
        if (
            !slideshowState.image.startsWith('data:image/')
            || !slideshowState.title
            || slideshowState.mainControls !== 3
            || slideshowState.optionControls !== 3
            || slideshowState.thumbs !== 3
            || !slideshowState.hasOpacity
        ) {
            throw new Error(`Cover slideshow mismatch: ${JSON.stringify(slideshowState)}`);
        }
        await frame.locator('[data-phone-action^="slide-shuffle"]').click();
        await frame.locator('[data-phone-action^="slide-faster"]').click();
        await frame.locator('[data-phone-slide-opacity]').evaluate((input) => {
            input.value = '65';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const slideshowControlsState = await frame.locator('body').evaluate(() => {
            const state = window.EveMatrixDatapackPhone.getState();
            return {
                shuffle: state.slideShuffle,
                speed: state.slideSpeed,
                opacity: state.slideOpacity,
                imageOpacity: document.querySelector('.eve-matrix-phone-slide-detail > img')?.style.opacity || ''
            };
        });
        if (
            !slideshowControlsState.shuffle
            || slideshowControlsState.speed !== 2500
            || slideshowControlsState.opacity !== 65
            || slideshowControlsState.imageOpacity !== '0.65'
        ) {
            throw new Error(`Slideshow controls mismatch: ${JSON.stringify(slideshowControlsState)}`);
        }

        const slideshowBookmarkTitle = await frame.locator('.eve-matrix-phone-slide-detail strong').textContent();
        await frame.locator('.eve-matrix-phone-slide-detail').click();
        const slideshowBookmarkDetail = await frame.locator('.eve-matrix-phone-detail').evaluate((node) => ({
            title: node.querySelector('strong')?.textContent || '',
            scope: node.querySelector('span')?.textContent || '',
            hasOpenAction: !!node.querySelector('a[href]')
        }));
        if (
            slideshowBookmarkDetail.title !== slideshowBookmarkTitle
            || !slideshowBookmarkDetail.scope
            || !slideshowBookmarkDetail.hasOpenAction
        ) {
            throw new Error(`Slideshow bookmark detail mismatch: ${JSON.stringify({
                slideshowBookmarkTitle,
                slideshowBookmarkDetail
            })}`);
        }
        await frame.locator('[data-phone-back]').click();
        await frame.locator('.eve-matrix-phone-slideshow').waitFor({
            state: 'visible',
            timeout: 30000
        });

        await frame.locator('#slideshowCheckbox').check();
        await frame.locator('.slideshow-toggle-tab').click();
        await frame.locator('.slideshow-toggle-tab').click();
        await page.waitForTimeout(450);
        const originalSlideshowBounds = await frame.locator('#slideshowBar').evaluate((bar) => {
            const rect = bar.getBoundingClientRect();
            return {
                top: rect.top,
                bottom: rect.bottom,
                height: rect.height,
                viewportHeight: window.innerHeight,
                innerScrollWidth: bar.querySelector('.slideshow-bar-inner')?.scrollWidth || 0,
                innerClientWidth: bar.querySelector('.slideshow-bar-inner')?.clientWidth || 0
            };
        });
        if (
            originalSlideshowBounds.top < -1
            || originalSlideshowBounds.bottom > originalSlideshowBounds.viewportHeight + 1
            || originalSlideshowBounds.height <= 0
        ) {
            throw new Error(`Original slideshow bar clipped outside viewport: ${JSON.stringify(originalSlideshowBounds)}`);
        }

        const { unidexScope, detachedState, largePackRefreshMs } = await runScopeScaleDetach({
            page,
            context,
            seedDatapack,
            seedLargeDatapack
        });

        console.log('MATRIX_DATAPACK_PHONE_BROWSER_SMOKE_OK', JSON.stringify({
            homeState,
            initialScope,
            scopedTabNames,
            tabIconShape,
            matrixRootItems,
            favoritesItems,
            enrichedBookmarkDetail,
            savedPhoneEdit,
            fantasyCoverBookmarks,
            messageBridgeEdit,
            unlinkedEdit,
            mutationState,
            coverScopes,
            coveredBookmarks,
            slideshowState,
            slideshowControlsState,
            originalSlideshowBounds,
            unidexScope,
            detachedState,
            largePackRefreshMs
        }));
    } catch (error) {
        console.error(error && error.stack ? error.stack : error);
        console.error(serverOutput.slice(-12000));
        process.exitCode = 1;
    } finally {
        if (context) {
            try { await context.close(); } catch (error) {}
        }
        if (browser) {
            try { await browser.close(); } catch (error) {}
        }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (!server.killed) server.kill('SIGKILL');
        fs.rmSync(modularRoot, { recursive: true, force: true });
    }
})();
