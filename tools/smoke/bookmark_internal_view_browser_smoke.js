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
        typeof window.openBookmarkFromDashboard === 'function'
        && typeof window.handleLinkClick === 'function'
        && !!window.EveBookmarkClickBehavior?.setDefaultMode
        && !!window.EveQuickPins?._main?.activateBookmarkPin
        && !!document.getElementById('bookmarkFocusModal')
        && !!document.getElementById('settingsModal')
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
            const linkId = '__bookmark_internal_view_smoke__';
            const existingLinks = Array.isArray(window.eveState?.links) ? window.eveState.links : [];
            const nextLinks = existingLinks.filter((entry) => String(entry?.id || '').trim() !== linkId);
            nextLinks.push({
                id: linkId,
                title: 'Internal View Smoke',
                url: 'https://example.com/internal-view-smoke',
                category: 'Unsorted',
                workspace: 'main'
            });

            existingLinks.length = 0;
            nextLinks.forEach((entry) => existingLinks.push(entry));
            window.links = existingLinks;

            const settingsSelect = document.getElementById('bookmarkClickBehaviorSelect');
            const settingsOptions = settingsSelect
                ? Array.from(settingsSelect.options).map((option) => option.value)
                : [];

            const modal = document.getElementById('bookmarkFocusModal');
            if (modal) modal.style.display = 'none';

            const popupCalls = [];
            const newTabCalls = [];
            const originalPopupManager = window.PopupManager;
            const originalPopupOpen = window.PopupManager?.openPopup;
            const originalWindowOpen = window.open;

            window.PopupManager = window.PopupManager || {};
            window.PopupManager.openPopup = function (url, title) {
                popupCalls.push({ url, title });
                return true;
            };
            window.open = function (url, target) {
                newTabCalls.push({ url, target });
                return null;
            };

            const previousDefaultMode = window.EveBookmarkClickBehavior.getDefaultMode();
            window.EveBookmarkClickBehavior.setDefaultMode('internal_only');

            const resolution = window.EveBookmarkClickBehavior.resolveBehaviorForLink(linkId);
            const dashboardHandled = window.openBookmarkFromDashboard({ preventDefault() {}, stopPropagation() {} }, linkId);
            await new Promise((resolve) => setTimeout(resolve, 120));

            const afterDashboard = {
                popupCalls: popupCalls.slice(),
                newTabCalls: newTabCalls.slice(),
                focusVisible: modal ? window.getComputedStyle(modal).display !== 'none' : false,
                dashboardHandled
            };

            if (modal) modal.style.display = 'none';
            const quickPinHandled = window.EveQuickPins._main.activateBookmarkPin({ targetId: linkId });
            await new Promise((resolve) => setTimeout(resolve, 120));

            const afterQuickPin = {
                popupCalls: popupCalls.slice(),
                newTabCalls: newTabCalls.slice(),
                focusVisible: modal ? window.getComputedStyle(modal).display !== 'none' : false,
                quickPinHandled
            };

            window.EveBookmarkClickBehavior.setDefaultMode(previousDefaultMode);
            window.open = originalWindowOpen;
            if (window.PopupManager && originalPopupOpen) {
                window.PopupManager.openPopup = originalPopupOpen;
            } else if (originalPopupManager) {
                window.PopupManager = originalPopupManager;
            }

            return {
                settingsOptions,
                resolution,
                afterDashboard,
                afterQuickPin
            };
        });

        assert(
            result.settingsOptions.includes('internal_only'),
            `Expected settings to expose the internal bookmark view mode, got: ${JSON.stringify(result.settingsOptions)}`
        );
        assert(
            result.resolution.openTarget === 'internal' && result.resolution.openFocus === false,
            `Expected internal-only bookmark mode to resolve to internal/no-focus, got: ${JSON.stringify(result.resolution)}`
        );
        assert(
            result.afterDashboard.dashboardHandled === false,
            `Expected dashboard bookmark handler to cancel default navigation, got: ${result.afterDashboard.dashboardHandled}`
        );
        assert(
            result.afterDashboard.popupCalls.length === 1
                && result.afterDashboard.popupCalls[0].url === 'https://example.com/internal-view-smoke',
            `Expected dashboard click to open the in-site popup once, got: ${JSON.stringify(result.afterDashboard.popupCalls)}`
        );
        assert(
            result.afterDashboard.newTabCalls.length === 0,
            `Expected dashboard click to avoid window.open for internal mode, got: ${JSON.stringify(result.afterDashboard.newTabCalls)}`
        );
        assert(
            result.afterDashboard.focusVisible === false,
            'Expected bookmark focus modal to stay closed for internal-only dashboard clicks'
        );
        assert(
            result.afterQuickPin.quickPinHandled === true,
            'Expected quick pin activation to succeed for the smoke bookmark'
        );
        assert(
            result.afterQuickPin.popupCalls.length === 2,
            `Expected quick pin activation to reuse the in-site popup flow, got: ${JSON.stringify(result.afterQuickPin.popupCalls)}`
        );
        assert(
            result.afterQuickPin.newTabCalls.length === 0,
            `Expected quick pin activation to avoid window.open for internal mode, got: ${JSON.stringify(result.afterQuickPin.newTabCalls)}`
        );
        assert(
            result.afterQuickPin.focusVisible === false,
            'Expected bookmark focus modal to stay closed for internal-only quick pin activation'
        );

        console.log('BOOKMARK_INTERNAL_VIEW_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
