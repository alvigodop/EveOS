const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openSettings === 'function'
        && typeof window.toggleBulkMode === 'function'
        && !!document.getElementById('settingsModal')
        && !!document.getElementById('search')
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(() => {
            const body = document.body;
            const search = document.getElementById('search');
            if (!search) throw new Error('Missing search input');

            const dispatchAltB = (target) => {
                (target || document).dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'b',
                    altKey: true,
                    bubbles: true
                }));
            };

            body.classList.remove('bulk-active');
            if (typeof window.setBulkMode === 'function') {
                window.setBulkMode(false);
            }

            dispatchAltB(document);
            const bulkEnabledAfterShortcut = body.classList.contains('bulk-active');
            if (!bulkEnabledAfterShortcut) {
                throw new Error('Alt+B did not enable bulk mode');
            }

            search.focus();
            dispatchAltB(search);
            const bulkDisabledAfterSecondShortcut = !body.classList.contains('bulk-active');
            if (!bulkDisabledAfterSecondShortcut) {
                throw new Error('Alt+B did not toggle bulk mode while a field was focused');
            }

            window.openSettings();
            const shortcutRows = Array.from(document.querySelectorAll('#settingsShortcutList > div')).map((row) => row.textContent.replace(/\s+/g, ' ').trim());

            return {
                shortcuts: shortcutRows,
                hasAltB: shortcutRows.some((text) => text.includes('Alt+B') && text.includes('Toggle Select mode')),
                hasSlash: shortcutRows.some((text) => text.includes('/') && text.includes('Focus the main search field')),
                hasEscape: shortcutRows.some((text) => text.includes('Escape') && text.includes('exit Select mode'))
            };
        });

        if (!result.hasAltB) {
            throw new Error(`Settings shortcut list missing Alt+B entry: ${JSON.stringify(result.shortcuts)}`);
        }
        if (!result.hasSlash) {
            throw new Error(`Settings shortcut list missing / entry: ${JSON.stringify(result.shortcuts)}`);
        }
        if (!result.hasEscape) {
            throw new Error(`Settings shortcut list missing Escape entry: ${JSON.stringify(result.shortcuts)}`);
        }

        console.log('SETTINGS_SHORTCUTS_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
