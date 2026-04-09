const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openBookmarkFocusModal === 'function'
        && typeof window.bookmarkFocusSaveClickBehavior === 'function'
        && typeof window.bookmarkFocusOpenAgain === 'function'
        && !!window.EveBookmarkClickBehavior?.setBookmarkMode
        && !!window.PopupManager?.openPopup
        && !!document.getElementById('bookmarkFocusModal')
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await waitForApp(page);
        await page.waitForTimeout(1500);

        const result = await page.evaluate(async () => {
            const linkId = '__bookmark_focus_override_smoke__';
            const links = Array.isArray(window.eveState?.links) ? window.eveState.links : [];
            const nextLinks = links.filter((entry) => String(entry?.id || '').trim() !== linkId);
            nextLinks.push({
                id: linkId,
                title: 'Bookmark Focus Override Smoke',
                url: 'https://example.com/focus-override-smoke',
                category: 'Unsorted',
                workspace: 'main'
            });
            links.length = 0;
            nextLinks.forEach((entry) => links.push(entry));
            window.links = links;

            const popupCalls = [];
            const newTabCalls = [];
            const originalPopupOpen = window.PopupManager.openPopup;
            const originalWindowOpen = window.open;
            window.PopupManager.openPopup = function (url, title) {
                popupCalls.push({ url, title });
                return true;
            };
            window.open = function (url, target) {
                newTabCalls.push({ url, target });
                return null;
            };

            const modal = document.getElementById('bookmarkFocusModal');
            const opened = window.openBookmarkFocusModal(linkId);
            await new Promise((resolve) => setTimeout(resolve, 120));

            const beforeSave = {
                opened,
                modalVisible: modal ? window.getComputedStyle(modal).display !== 'none' : false,
                resolution: window.EveBookmarkClickBehavior.resolveBehaviorForLink(linkId)
            };

            window.bookmarkFocusSaveClickBehavior('internal_only');
            await new Promise((resolve) => setTimeout(resolve, 200));

            const afterSave = {
                modalVisible: modal ? window.getComputedStyle(modal).display !== 'none' : false,
                bookmarkMode: window.EveBookmarkClickBehavior.getBookmarkMode(linkId),
                resolution: window.EveBookmarkClickBehavior.resolveBehaviorForLink(linkId)
            };

            if (modal) modal.style.display = 'none';
            const clickHandled = window.openBookmarkFromDashboard({ preventDefault() {}, stopPropagation() {} }, linkId);
            await new Promise((resolve) => setTimeout(resolve, 200));

            const afterDashboardClick = {
                clickHandled,
                modalVisible: modal ? window.getComputedStyle(modal).display !== 'none' : false,
                popupCalls: popupCalls.slice(),
                newTabCalls: newTabCalls.slice(),
                resolution: window.EveBookmarkClickBehavior.resolveBehaviorForLink(linkId)
            };

            window.bookmarkFocusOpenAgain();
            await new Promise((resolve) => setTimeout(resolve, 120));

            const afterOpenAgain = {
                popupCalls: popupCalls.slice(),
                newTabCalls: newTabCalls.slice()
            };

            window.PopupManager.openPopup = originalPopupOpen;
            window.open = originalWindowOpen;

            return {
                beforeSave,
                afterSave,
                afterDashboardClick,
                afterOpenAgain
            };
        });

        assert(result.beforeSave.opened === true, 'Expected Bookmark Focus modal to open for the smoke bookmark');
        assert(result.beforeSave.modalVisible === true, 'Expected Bookmark Focus modal to be visible before saving override');
        assert(
            result.afterSave.bookmarkMode === 'internal_only',
            `Expected the explicit bookmark override to persist as internal_only, got: ${result.afterSave.bookmarkMode}`
        );
        assert(
            result.afterSave.modalVisible === true,
            'Expected Bookmark Focus modal to remain visible after saving the override'
        );
        assert(
            result.afterSave.resolution.openTarget === 'internal' && result.afterSave.resolution.openFocus === true,
            `Expected bookmark-level internal override to keep Focus accessible, got: ${JSON.stringify(result.afterSave.resolution)}`
        );
        assert(
            result.afterDashboardClick.clickHandled === false,
            `Expected dashboard click handler to cancel default navigation, got: ${result.afterDashboardClick.clickHandled}`
        );
        assert(
            result.afterDashboardClick.popupCalls.length >= 1
                && result.afterDashboardClick.popupCalls[0].url === 'https://example.com/focus-override-smoke',
            `Expected dashboard click to use the in-site popup for bookmark-level internal override, got: ${JSON.stringify(result.afterDashboardClick.popupCalls)}`
        );
        assert(
            result.afterDashboardClick.newTabCalls.length === 0,
            `Expected dashboard click to avoid window.open for bookmark-level internal override, got: ${JSON.stringify(result.afterDashboardClick.newTabCalls)}`
        );
        assert(
            result.afterDashboardClick.modalVisible === true,
            'Expected normal bookmark clicks to reopen Bookmark Focus for bookmark-level internal overrides'
        );
        assert(
            result.afterOpenAgain.popupCalls.length >= 2,
            `Expected Bookmark Focus Open button to respect the internal view target, got: ${JSON.stringify(result.afterOpenAgain.popupCalls)}`
        );
        assert(
            result.afterOpenAgain.newTabCalls.length === 0,
            `Expected Bookmark Focus Open button to avoid new-tab fallback for internal overrides, got: ${JSON.stringify(result.afterOpenAgain.newTabCalls)}`
        );

        console.log('BOOKMARK_FOCUS_OVERRIDE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
