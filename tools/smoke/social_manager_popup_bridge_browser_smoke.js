const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function waitForSocialManager(page) {
    await page.waitForFunction(() => (
        typeof window.openSocialManagerModal === 'function'
        && typeof window.reloadSocialManagerModal === 'function'
        && !!window.SocialManagerEmbeddedHtmlB64
    ), undefined, { timeout: 180000 });
    await page.waitForTimeout(1500);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await waitForSocialManager(page);

        const result = await page.evaluate(async () => {
            const popupViewerCalls = [];
            window.EveOS = window.EveOS || {};
            window.EveOS.API = window.EveOS.API || {};
            window.EveOS.API.Core = window.EveOS.API.Core || {};
            window.EveOS.API.Core.getPopupViewerUrl = async function (targetUrl) {
                popupViewerCalls.push(targetUrl);
                return `http://127.0.0.1:3040/api/popup-view?url=${encodeURIComponent(targetUrl)}`;
            };

            window.openSocialManagerModal();

            const frame = document.getElementById('socialManagerFrame');
            if (!frame) {
                throw new Error('Social Manager frame not found');
            }

            if (!frame.contentDocument || frame.contentDocument.readyState !== 'complete') {
                await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => reject(new Error('Social Manager frame load timed out')), 30000);
                    frame.addEventListener('load', function handleLoad() {
                        clearTimeout(timeoutId);
                        resolve();
                    }, { once: true });
                });
            }

            await new Promise((resolve) => setTimeout(resolve, 250));

            const win = frame.contentWindow;
            const doc = frame.contentDocument;
            if (!win || !doc || typeof win.openPopup !== 'function') {
                throw new Error('Social Manager popup bridge hook did not install');
            }

            await win.openPopup('driftcore', 'instagram');
            await new Promise((resolve) => setTimeout(resolve, 200));

            const popup = doc.getElementById('instaPopup');
            const popupFrame = doc.getElementById('popupFrame');
            const popupTitle = doc.getElementById('popupTitle');
            const popupRealLink = doc.getElementById('popupRealLink');
            const popupStatus = doc.querySelector('#eveSocialPopupActions [data-role="status"]');
            const approveButton = doc.querySelector('#eveSocialPopupActions [data-role="approve"]');

            if (!popup || !popupFrame || !popupTitle || !popupRealLink || !popupStatus || !approveButton) {
                throw new Error('Social Manager popup controls did not render');
            }

            const beforeApprove = {
                active: popup.classList.contains('active'),
                popupSrc: popupFrame.src,
                title: popupTitle.textContent.trim(),
                realHref: popupRealLink.href,
                status: popupStatus.textContent.trim()
            };

            approveButton.click();
            await new Promise((resolve) => setTimeout(resolve, 200));

            const approvedNames = JSON.parse(win.localStorage.getItem('approvedNamesDB') || '[]');

            return {
                popupViewerCalls,
                beforeApprove,
                afterApprove: {
                    active: popup.classList.contains('active'),
                    approvedNames
                }
            };
        });

        assert(
            result.popupViewerCalls.includes('https://instagram.com/driftcore'),
            `Expected popup bridge resolver call for Instagram target, got: ${JSON.stringify(result.popupViewerCalls)}`
        );
        assert(result.beforeApprove.active, 'Expected Social Manager popup to be active');
        assert(
            result.beforeApprove.popupSrc === 'http://127.0.0.1:3040/api/popup-view?url=https%3A%2F%2Finstagram.com%2Fdriftcore',
            `Expected embedded popup iframe to use popup bridge URL, got: ${result.beforeApprove.popupSrc}`
        );
        assert(
            result.beforeApprove.title === 'Instagram · @driftcore',
            `Expected popup title to reflect the current Instagram target, got: ${result.beforeApprove.title}`
        );
        assert(
            result.beforeApprove.realHref === 'https://instagram.com/driftcore',
            `Expected real-link href to target Instagram, got: ${result.beforeApprove.realHref}`
        );
        assert(
            /bridge view active/i.test(result.beforeApprove.status),
            `Expected bridge-active status copy, got: ${result.beforeApprove.status}`
        );
        assert(!result.afterApprove.active, 'Expected popup to close after approving from bridge view');
        assert(
            Array.isArray(result.afterApprove.approvedNames) && result.afterApprove.approvedNames.includes('driftcore'),
            `Expected approved DB to include the approved Instagram handle, got: ${JSON.stringify(result.afterApprove.approvedNames)}`
        );

        console.log('SOCIAL_MANAGER_POPUP_BRIDGE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
