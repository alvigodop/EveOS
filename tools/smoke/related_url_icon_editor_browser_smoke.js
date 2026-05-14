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
        typeof window.openRelatedUrlFromDashboard === 'function'
        && typeof window.openBookmarkFromDashboard === 'function'
        && typeof window.openBookmarkFocusModal === 'function'
        && typeof window.openEdit === 'function'
        && !!window.EveBookmarkClickBehavior?.setDefaultMode
        && !!window.EveLinkForm?.relatedUrlsReady
        && typeof window.EveLinkForm?.parseRelatedUrlsValue === 'function'
        && typeof window.DashboardCategories?.buildLinkHtml === 'function'
        && !!document.getElementById('bookmarkFocusModal')
        && !!document.getElementById('addModal')
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await waitForApp(page);
        await page.waitForTimeout(800);

        const result = await page.evaluate(async () => {
            const linkId = '__related_url_icon_editor_smoke__';
            const relatedUrl = 'https://related.example.com/smoke-target';
            const secondUrl = 'https://mirror.example.com/smoke-target';
            const links = Array.isArray(window.eveState?.links) ? window.eveState.links : [];
            const keptLinks = links.filter((entry) => String(entry?.id || '') !== linkId);
            keptLinks.push({
                id: linkId,
                title: 'Related URL Smoke',
                url: 'https://base.example.com/smoke-base',
                category: 'Unsorted',
                workspace: 'main',
                relatedUrls: [
                    {
                        id: 'related-smoke-1',
                        url: relatedUrl,
                        label: 'Mirror',
                        notes: 'Existing related URL'
                    }
                ]
            });
            links.length = 0;
            keptLinks.forEach((entry) => links.push(entry));
            window.links = links;

            const previousDefaultMode = window.EveBookmarkClickBehavior.getDefaultMode();
            window.EveBookmarkClickBehavior.setDefaultMode('focus_only');

            const host = document.createElement('div');
            host.id = 'related-url-smoke-host';
            host.innerHTML = window.DashboardCategories.buildLinkHtml(links.find((entry) => String(entry.id) === linkId), '', 'main', window.config?.workspaces || []);
            document.body.appendChild(host);

            const button = host.querySelector('.bookmark-related-url-action');
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            const clickResult = button?.dispatchEvent(clickEvent);
            await new Promise((resolve) => setTimeout(resolve, 150));

            const focusModal = document.getElementById('bookmarkFocusModal');
            const focusUrl = document.getElementById('bookmarkFocusUrl');
            const modalVisible = focusModal ? window.getComputedStyle(focusModal).display !== 'none' : false;
            const headerText = focusUrl?.textContent || '';
            const headerHref = focusUrl?.href || '';

            const openCalls = [];
            const originalOpen = window.open;
            window.open = function (url, target) {
                openCalls.push({ url, target });
                return null;
            };
            window.bookmarkFocusOpenAgain();
            window.open = originalOpen;

            window.openEdit(linkId);
            await new Promise((resolve) => setTimeout(resolve, 150));

            const initialRows = document.querySelectorAll('#newRelatedUrlsList .bookmark-related-url-editor-row').length;
            const summaryBefore = document.getElementById('newRelatedUrlsSummary')?.textContent || '';

            document.getElementById('newRelatedUrlCandidate').value = secondUrl;
            document.getElementById('newRelatedUrlLabel').value = 'Mirror 2';
            window.addRelatedUrlEntryCandidate();
            await new Promise((resolve) => setTimeout(resolve, 80));

            const rowsAfterAdd = document.querySelectorAll('#newRelatedUrlsList .bookmark-related-url-editor-row').length;
            const storeAfterAdd = document.getElementById('newRelatedUrls')?.value || '';
            const parsedAfterAdd = window.EveLinkForm.parseRelatedUrlsValue(storeAfterAdd);
            const labelsAfterAdd = parsedAfterAdd.map((entry) => entry.label || entry.title || '');
            const urlsAfterAdd = parsedAfterAdd.map((entry) => entry.url);
            const summaryAfter = document.getElementById('newRelatedUrlsSummary')?.textContent || '';

            window.EveBookmarkClickBehavior.setDefaultMode(previousDefaultMode);
            document.getElementById('related-url-smoke-host')?.remove();
            if (focusModal) focusModal.style.display = 'none';

            return {
                hasButton: !!button,
                clickResult,
                modalVisible,
                headerText,
                headerHref,
                openCalls,
                initialRows,
                rowsAfterAdd,
                summaryBefore,
                summaryAfter,
                labelsAfterAdd,
                urlsAfterAdd
            };
        });

        assert(result.hasButton, 'Expected related URL icon button to render');
        assert(result.clickResult === false, 'Expected related URL icon click to cancel default navigation');
        assert(result.modalVisible === true, 'Expected related URL click to open the normal bookmark popup in focus-only mode');
        assert(
            result.headerText.includes('Related URL') && result.headerText.includes('https://related.example.com/smoke-target'),
            `Expected popup header to show the related URL target, got: ${result.headerText}`
        );
        assert(
            result.headerHref === 'https://related.example.com/smoke-target',
            `Expected popup link href to target the related URL, got: ${result.headerHref}`
        );
        assert(
            result.openCalls.length === 1 && result.openCalls[0].url === 'https://related.example.com/smoke-target',
            `Expected Bookmark Focus Open to use the related URL target, got: ${JSON.stringify(result.openCalls)}`
        );
        assert(result.initialRows === 1, `Expected editor to render the existing related URL row, got: ${result.initialRows}`);
        assert(result.rowsAfterAdd === 2, `Expected editor add flow to render two related URL rows, got: ${result.rowsAfterAdd}`);
        assert(
            result.urlsAfterAdd.includes('https://related.example.com/smoke-target')
                && result.urlsAfterAdd.includes('https://mirror.example.com/smoke-target'),
            `Expected hidden store to serialize both related URLs, got: ${JSON.stringify(result.urlsAfterAdd)}`
        );
        assert(
            result.labelsAfterAdd.includes('Mirror') && result.labelsAfterAdd.includes('Mirror 2'),
            `Expected structured labels to survive editor serialization, got: ${JSON.stringify(result.labelsAfterAdd)}`
        );
        assert(
            result.summaryBefore === '1 related' && result.summaryAfter === '2 related',
            `Expected related URL summaries to update, got before=${result.summaryBefore} after=${result.summaryAfter}`
        );

        console.log('RELATED_URL_ICON_EDITOR_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
