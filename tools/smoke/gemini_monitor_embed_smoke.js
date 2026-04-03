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
        await page.waitForFunction(() => (
            !!document.getElementById('loadingIndicator')
            && !!document.getElementById('gemini-ui-root')
            && !!window.SearchMonitorBoot
        ), undefined, { timeout: 120000 });

        await page.evaluate(() => {
            document.getElementById('loadingIndicator')?.click();
        });
        await page.waitForFunction(() => {
            const indicator = document.getElementById('loadingIndicator');
            return !!indicator && !indicator.classList.contains('compact');
        }, undefined, { timeout: 10000 });

        await page.evaluate(() => {
            document.getElementById('gemini-ui-root')
                ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        });

        const result = await page.evaluate(() => {
            function box(selector) {
                const el = document.querySelector(selector);
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return {
                    width: rect.width,
                    height: rect.height,
                    display: style.display,
                    position: style.position,
                    overflow: style.overflow
                };
            }

            const root = box('#gemini-ui-root');
            const summaryPane = box('#gemini-monitor-summary-pane');
            const container = box('#gemini-ui-root .mdl-layout__container');
            const hiddenRightColumn = document.querySelector('#gemini-ui-root .right-column')
                ? window.getComputedStyle(document.querySelector('#gemini-ui-root .right-column')).display
                : 'none';
            const hiddenVideoSection = document.querySelector('#gemini-ui-root .video-section')
                ? window.getComputedStyle(document.querySelector('#gemini-ui-root .video-section')).display
                : 'none';
            const hiddenHeader = document.querySelector('#gemini-ui-root .mdl-layout__header')
                ? window.getComputedStyle(document.querySelector('#gemini-ui-root .mdl-layout__header')).display
                : 'none';

            return {
                root,
                summaryPane,
                container,
                hiddenRightColumn,
                hiddenVideoSection,
                hiddenHeader,
                indicatorHeight: document.getElementById('loadingIndicator')?.getBoundingClientRect().height || 0,
                geminiRootChildren: document.getElementById('gemini-ui-root')?.children.length || 0,
                viewMode: document.getElementById('gemini-ui-root')?.dataset?.geminiMonitorView || ''
            };
        });

        if (!result.root || result.root.height < 150) {
            throw new Error(`Gemini monitor root did not maintain visible height: ${JSON.stringify(result)}`);
        }
        if (result.viewMode !== 'summary') {
            throw new Error(`Search Monitor should default to compact summary mode: ${JSON.stringify(result)}`);
        }
        if (!result.summaryPane || result.summaryPane.display === 'none' || result.summaryPane.height < 180) {
            throw new Error(`Gemini summary pane did not render stably: ${JSON.stringify(result)}`);
        }
        if (result.container && result.container.display !== 'none') {
            throw new Error(`Compact summary mode should keep the full workspace hidden: ${JSON.stringify(result)}`);
        }
        if (result.hiddenRightColumn !== 'none' || result.hiddenVideoSection !== 'none' || result.hiddenHeader !== 'none') {
            throw new Error(`Search Monitor embed is still exposing bulky Gemini sections: ${JSON.stringify(result)}`);
        }

        const criticalConsoleErrors = consoleErrors.filter((entry) => !isBenignConsoleError(entry));
        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        console.log(`GEMINI_MONITOR_EMBED_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
});
