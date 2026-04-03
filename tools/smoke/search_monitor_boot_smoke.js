const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function isBenignConsoleError(entry) {
    return /Tracking Prevention blocked access to storage/i.test(entry)
        || /Failed to load resource/i.test(entry)
        || /Access to fetch at/i.test(entry)
        || /QuotaExceededError/i.test(entry)
        || /Critical module CacheManager is missing/i.test(entry)
        || /ERR_FAILED 200 \(OK\)/i.test(entry)
        || /ERR_CONNECTION_RESET/i.test(entry)
        || /ERR_FAILED 403 \(Forbidden\)/i.test(entry);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (error) => {
        pageErrors.push(error && error.stack ? error.stack : String(error));
    });
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });

        await page.waitForFunction(() => {
            const indicator = document.getElementById('loadingIndicator');
            const geminiRoot = document.getElementById('gemini-ui-root');
            const bootHelperReady = !!window.SearchMonitorBoot;
            const loadingIndicatorReady = !!window.LoadingIndicator?._initialized;
            if (!indicator || !geminiRoot || !bootHelperReady || loadingIndicatorReady) {
                return false;
            }
            const style = window.getComputedStyle(indicator);
            return indicator.classList.contains('visible') && style.display !== 'none';
        }, undefined, { timeout: 120000 });

        const preClickState = await page.evaluate(() => ({
            compact: document.getElementById('loadingIndicator')?.classList.contains('compact') || false,
            geminiVisible: !!document.getElementById('gemini-ui-root'),
            loadingIndicatorReady: !!window.LoadingIndicator?._initialized
        }));

        if (!preClickState.compact || !preClickState.geminiVisible || preClickState.loadingIndicatorReady) {
            throw new Error(`Unexpected pre-click early-boot state: ${JSON.stringify(preClickState)}`);
        }

        await page.evaluate(() => {
            document.getElementById('loadingIndicator')?.click();
        });

        await page.waitForFunction(() => {
            const indicator = document.getElementById('loadingIndicator');
            return !!indicator && !indicator.classList.contains('compact');
        }, undefined, { timeout: 10000 });

        const result = await page.evaluate(() => {
            const indicator = document.getElementById('loadingIndicator');
            const geminiRoot = document.getElementById('gemini-ui-root');
            return {
                compact: indicator?.classList.contains('compact') || false,
                ariaLabel: indicator?.getAttribute('aria-label') || '',
                geminiRootPresent: !!geminiRoot,
                geminiInsideIndicator: !!geminiRoot && indicator?.contains(geminiRoot),
                loadingIndicatorReady: !!window.LoadingIndicator?._initialized,
                searchMonitorBootReady: !!window.SearchMonitorBoot
            };
        });

        if (result.compact) {
            throw new Error(`Search Monitor stayed compact after early click: ${JSON.stringify(result)}`);
        }
        if (!result.geminiRootPresent || !result.geminiInsideIndicator) {
            throw new Error(`Gemini shell missing from Search Monitor: ${JSON.stringify(result)}`);
        }
        if (result.ariaLabel !== 'Toggle Search Monitor') {
            throw new Error(`Search Monitor boot helper did not set accessibility metadata: ${JSON.stringify(result)}`);
        }

        await page.waitForFunction(() => !!window.LoadingIndicator?._initialized, undefined, { timeout: 120000 });

        await page.evaluate(() => {
            document.getElementById('loadingIndicator')?.click();
        });
        await page.waitForFunction(() => {
            const indicator = document.getElementById('loadingIndicator');
            return !!indicator && indicator.classList.contains('compact');
        }, undefined, { timeout: 10000 });

        await page.evaluate(() => {
            document.getElementById('loadingIndicator')?.click();
        });
        await page.waitForFunction(() => {
            const indicator = document.getElementById('loadingIndicator');
            return !!indicator && !indicator.classList.contains('compact');
        }, undefined, { timeout: 10000 });

        const postModuleState = await page.evaluate(() => ({
            compact: document.getElementById('loadingIndicator')?.classList.contains('compact') || false,
            loadingIndicatorReady: !!window.LoadingIndicator?._initialized,
            geminiRootPresent: !!document.getElementById('gemini-ui-root')
        }));

        if (postModuleState.compact || !postModuleState.loadingIndicatorReady || !postModuleState.geminiRootPresent) {
            throw new Error(`Search Monitor did not stay functional after LoadingIndicator init: ${JSON.stringify(postModuleState)}`);
        }

        const criticalConsoleErrors = consoleErrors.filter((entry) => !isBenignConsoleError(entry));
        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        console.log(`SEARCH_MONITOR_BOOT_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
});
