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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1280 } });
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', (error) => {
        pageErrors.push(error && error.stack ? error.stack : String(error));
    });
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await page.waitForFunction(() => (
            !!document.getElementById('loadingIndicator')
            && !!document.getElementById('gemini-ui-root')
            && !!window.SearchMonitorBoot
        ), undefined, { timeout: 120000 });

        await page.evaluate(() => {
            document.getElementById('loadingIndicator')?.click();
        });
        await page.waitForFunction(() => !document.getElementById('loadingIndicator')?.classList.contains('compact'), undefined, { timeout: 10000 });

        await page.evaluate(() => {
            document.querySelector('[data-gemini-monitor-view-btn="full"]')?.click();
        });
        await page.waitForFunction(() => {
            const root = document.getElementById('gemini-ui-root');
            return !!root && root.dataset.geminiMonitorView === 'full';
        }, undefined, { timeout: 10000 });

        await page.waitForTimeout(20000);
        await page.evaluate(() => {
            const root = document.getElementById('gemini-ui-root');
            if (root) root.dataset.geminiFullReady = '0';
            window.dispatchEvent(new CustomEvent('eve:gemini-workspace-ready'));
        });
        await page.waitForFunction(() => (
            document.getElementById('gemini-ui-root')?.dataset.geminiFullReady === '1'
        ), undefined, { timeout: 10000 });

        const result = await page.evaluate(() => {
            function box(selector) {
                const el = document.querySelector(selector);
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return {
                    x: rect.x,
                    right: rect.right,
                    width: rect.width,
                    height: rect.height,
                    display: style.display,
                    position: style.position
                };
            }

            const root = document.getElementById('gemini-ui-root');
            const summaryPane = box('#gemini-monitor-summary-pane');
            const workspace = box('#gemini-ui-root .mdl-layout__container');
            const liveLinkCard = box('#gemini-live-link-card');
            const liveLinkSettings = document.getElementById('geminiLiveLinkSettingsButton');
            const selfTalkActions = box('.gemini-agentic-card--self-talk .gemini-agentic-card-actions');
            const selfTalkToggle = box('.gemini-agentic-card--self-talk .gemini-agentic-switch');
            const audioToggle = box('.gemini-agentic-card--audio .gemini-agentic-switch');

            return {
                compact: document.getElementById('loadingIndicator')?.classList.contains('compact') || false,
                rootMode: root?.dataset.geminiMonitorView || '',
                fullReady: root?.dataset.geminiFullReady || '',
                savedMode: window.localStorage?.getItem('eve.geminiMonitorView') || '',
                summaryPane,
                workspace,
                liveLinkCard,
                liveLinkCollapsed: document.getElementById('gemini-live-link-card')?.classList.contains('is-settings-collapsed') || false,
                liveLinkSettingsExpanded: liveLinkSettings?.getAttribute('aria-expanded') || '',
                selfTalkActions,
                selfTalkToggle,
                audioToggle
            };
        });

        if (result.rootMode !== 'full' || result.savedMode !== 'full') {
            throw new Error(`Gemini monitor did not persist full workspace mode: ${JSON.stringify(result)}`);
        }
        if (result.compact) {
            throw new Error(`Search Monitor collapsed while switching Gemini workspace mode: ${JSON.stringify(result)}`);
        }
        if (!result.summaryPane || result.summaryPane.display === 'none' || result.summaryPane.height < 120) {
            throw new Error(`Compact summary pane should remain visible in workspace mode: ${JSON.stringify(result)}`);
        }
        if (!result.workspace || result.workspace.display === 'none' || result.workspace.height < 220) {
            throw new Error(`Full Gemini workspace did not render in monitor: ${JSON.stringify(result)}`);
        }
        if (!result.liveLinkCard || result.liveLinkCard.height < 64 || !result.liveLinkCollapsed) {
            throw new Error(`Collapsed Gemini Live Link card did not render: ${JSON.stringify(result)}`);
        }
        if (!result.selfTalkToggle || result.selfTalkToggle.width < 48 || result.selfTalkToggle.height < 28) {
            throw new Error(`Self-talk toggle did not render inside its card bounds: ${JSON.stringify(result)}`);
        }
        if (!result.audioToggle || result.audioToggle.width < 48 || result.audioToggle.height < 28) {
            throw new Error(`Audio toggle did not render inside its card bounds: ${JSON.stringify(result)}`);
        }
        if (!result.selfTalkActions
            || result.selfTalkToggle.x < result.selfTalkActions.x
            || result.selfTalkToggle.right > (result.selfTalkActions.right + 1)) {
            throw new Error(`Self-talk toggle overflowed its action row: ${JSON.stringify(result)}`);
        }

        await page.evaluate(() => document.getElementById('geminiLiveLinkSettingsButton')?.click());
        await page.waitForFunction(() => document.getElementById('geminiLiveLinkSettingsDialog')?.open, undefined, { timeout: 10000 });
        const liveLinkDialog = await page.evaluate(() => {
            const dialog = document.getElementById('geminiLiveLinkSettingsDialog');
            const rect = dialog?.getBoundingClientRect();
            return {
                open: !!dialog?.open,
                height: rect?.height || 0,
                ariaExpanded: document.getElementById('geminiLiveLinkSettingsButton')?.getAttribute('aria-expanded') || '',
                modeOptions: document.getElementById('geminiLiveLinkMode')?.options.length || 0,
                scopeOptions: document.getElementById('geminiLiveLinkScopeMode')?.options.length || 0
            };
        });
        if (!liveLinkDialog.open || liveLinkDialog.ariaExpanded !== 'true'
            || liveLinkDialog.height < 300 || liveLinkDialog.modeOptions < 4 || liveLinkDialog.scopeOptions < 4) {
            throw new Error(`Gemini Live Link settings dialog did not render: ${JSON.stringify(liveLinkDialog)}`);
        }
        result.liveLinkDialog = liveLinkDialog;

        const criticalConsoleErrors = consoleErrors.filter((entry) => !isBenignConsoleError(entry));
        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        console.log(`GEMINI_MONITOR_DUAL_VIEW_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
});
