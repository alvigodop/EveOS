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

            const newTabCalls = [];
            const originalWindowOpen = window.open;
            window.open = function (url, target) {
                newTabCalls.push({ url, target });
                return null;
            };

            const runtimeBefore = {
                popupManagerPresent: !!window.PopupManager,
                popupViewerPresent: !!window.PopupViewer,
                pvUiPresent: !!window.PVUI,
                pvLoaderPresent: !!window.PVLoader
            };

            const previousDefaultMode = window.EveBookmarkClickBehavior.getDefaultMode();
            window.EveBookmarkClickBehavior.setDefaultMode('internal_only');

            const resolution = window.EveBookmarkClickBehavior.resolveBehaviorForLink(linkId);
            const dashboardHandled = window.openBookmarkFromDashboard({ preventDefault() {}, stopPropagation() {} }, linkId);
            const waitForPopupState = async () => {
                const startedAt = Date.now();
                while (Date.now() - startedAt < 6000) {
                    const popup = document.getElementById('wikiPopup');
                    const frame = document.getElementById('wikiPopupFrame');
                    const popupVisible = !!(popup && (popup.classList.contains('active') || window.getComputedStyle(popup).display !== 'none'));
                    const frameHasContent = !!(frame && ((frame.getAttribute('src') || '').trim() || (frame.getAttribute('srcdoc') || '').trim()));
                    const runtimeReady = !!(window.PopupManager && window.PopupViewer && window.PVUI && window.PVLoader);
                    if (popupVisible && frameHasContent && runtimeReady) {
                        return {
                            popupVisible,
                            frameHasContent,
                            runtimeReady
                        };
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }

                const popup = document.getElementById('wikiPopup');
                const frame = document.getElementById('wikiPopupFrame');
                return {
                    popupVisible: !!(popup && (popup.classList.contains('active') || window.getComputedStyle(popup).display !== 'none')),
                    frameHasContent: !!(frame && ((frame.getAttribute('src') || '').trim() || (frame.getAttribute('srcdoc') || '').trim())),
                    runtimeReady: !!(window.PopupManager && window.PopupViewer && window.PVUI && window.PVLoader)
                };
            };

            const dashboardPopupState = await waitForPopupState();

            const afterDashboard = {
                runtimeBefore,
                runtimeAfter: {
                    popupManagerPresent: !!window.PopupManager,
                    popupViewerPresent: !!window.PopupViewer,
                    pvUiPresent: !!window.PVUI,
                    pvLoaderPresent: !!window.PVLoader
                },
                newTabCalls: newTabCalls.slice(),
                focusVisible: modal ? window.getComputedStyle(modal).display !== 'none' : false,
                dashboardHandled,
                popupVisible: dashboardPopupState.popupVisible,
                frameHasContent: dashboardPopupState.frameHasContent,
                popupTitle: document.getElementById('wikiPopupTitle')?.textContent || ''
            };

            if (modal) modal.style.display = 'none';
            if (window.PopupManager?.closePopup) {
                window.PopupManager.closePopup();
            }
            const frame = document.getElementById('wikiPopupFrame');
            if (frame) {
                frame.removeAttribute('srcdoc');
                frame.src = '';
            }
            const quickPinHandled = window.EveQuickPins._main.activateBookmarkPin({ targetId: linkId });
            const quickPinPopupState = await waitForPopupState();

            const afterQuickPin = {
                newTabCalls: newTabCalls.slice(),
                focusVisible: modal ? window.getComputedStyle(modal).display !== 'none' : false,
                quickPinHandled,
                popupVisible: quickPinPopupState.popupVisible,
                frameHasContent: quickPinPopupState.frameHasContent,
                popupTitle: document.getElementById('wikiPopupTitle')?.textContent || ''
            };

            window.EveBookmarkClickBehavior.setDefaultMode(previousDefaultMode);
            window.open = originalWindowOpen;

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
            result.afterDashboard.runtimeAfter.popupManagerPresent
                && result.afterDashboard.runtimeAfter.popupViewerPresent
                && result.afterDashboard.runtimeAfter.pvUiPresent
                && result.afterDashboard.runtimeAfter.pvLoaderPresent,
            `Expected dashboard click to ensure the popup runtime is available, got: ${JSON.stringify(result.afterDashboard.runtimeAfter)}`
        );
        assert(
            result.afterDashboard.newTabCalls.length === 0,
            `Expected dashboard click to avoid window.open for internal mode, got: ${JSON.stringify(result.afterDashboard.newTabCalls)}`
        );
        assert(
            result.afterDashboard.popupVisible === true && result.afterDashboard.frameHasContent === true,
            `Expected dashboard click to show the in-site popup with content, got: ${JSON.stringify(result.afterDashboard)}`
        );
        assert(
            result.afterDashboard.popupTitle === 'Internal View Smoke',
            `Expected dashboard click to set the popup title, got: ${JSON.stringify(result.afterDashboard.popupTitle)}`
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
            result.afterQuickPin.newTabCalls.length === 0,
            `Expected quick pin activation to avoid window.open for internal mode, got: ${JSON.stringify(result.afterQuickPin.newTabCalls)}`
        );
        assert(
            result.afterQuickPin.popupVisible === true && result.afterQuickPin.frameHasContent === true,
            `Expected quick pin activation to reuse the in-site popup flow, got: ${JSON.stringify(result.afterQuickPin)}`
        );
        assert(
            result.afterQuickPin.popupTitle === 'Internal View Smoke',
            `Expected quick pin activation to preserve the popup title, got: ${JSON.stringify(result.afterQuickPin.popupTitle)}`
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
