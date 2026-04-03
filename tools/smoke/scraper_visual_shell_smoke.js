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

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openCategorySettings === 'function'
        && typeof window.switchCategoryTab === 'function'
        && !!document.getElementById('categorySettingsModal')
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1680, height: 1280 } });
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
        await waitForApp(page);

        await page.evaluate(() => {
            window.currentCategoryCtx = 'Alpha';
            window.openCategorySettings('Alpha', 'scraper');
        });

        await page.waitForFunction(() => {
            const bootCard = document.querySelector('.scraper-boot-card');
            const hero = document.querySelector('.scraper-sidebar-hero');
            return !!bootCard || !!hero;
        }, undefined, { timeout: 30000 });

        await page.waitForFunction(() => (
            !!document.querySelector('.scraper-sidebar-hero')
            && !!document.querySelector('#wikipediaManagement.scraper-management-panel')
            && !!document.querySelector('#apiSourceToggleCluster .source-toggle-btn')
        ), undefined, { timeout: 180000 });

        const initialResult = await page.evaluate(() => {
            function style(selector) {
                const el = document.querySelector(selector);
                if (!el) return null;
                const cs = window.getComputedStyle(el);
                return {
                    display: cs.display,
                    borderRadius: cs.borderRadius,
                    backgroundImage: cs.backgroundImage,
                    borderColor: cs.borderColor
                };
            }

            return {
                heroText: document.querySelector('.scraper-sidebar-hero h2')?.textContent?.trim() || '',
                panelCount: document.querySelectorAll('.scraper-management-panel').length,
                apiProviderTabs: document.querySelectorAll('#apiSourceToggleCluster .source-toggle-btn').length,
                wikiPanel: style('#wikipediaManagement'),
                actionsBar: style('#wikipediaManagement .domain-actions-container'),
                discoveryBlock: style('#wikipediaManagement .wiki-discovery'),
                fandomHidden: window.getComputedStyle(document.getElementById('fandomManagement')).display
            };
        });

        if (initialResult.heroText !== 'Knowledge Sources') {
            throw new Error(`Scraper hero did not render updated copy: ${JSON.stringify(initialResult)}`);
        }
        if (initialResult.panelCount < 3 || initialResult.apiProviderTabs < 13) {
            throw new Error(`Scraper management shell did not render all updated panels: ${JSON.stringify(initialResult)}`);
        }
        if (!initialResult.wikiPanel || Number.parseFloat(initialResult.wikiPanel.borderRadius) < 18) {
            throw new Error(`Wikipedia management panel did not get modern shell styling: ${JSON.stringify(initialResult)}`);
        }
        if (!initialResult.actionsBar || Number.parseFloat(initialResult.actionsBar.borderRadius) < 14) {
            throw new Error(`Wikipedia action bar did not get modern chip styling: ${JSON.stringify(initialResult)}`);
        }
        if (!initialResult.discoveryBlock || Number.parseFloat(initialResult.discoveryBlock.borderRadius) < 14) {
            throw new Error(`Discovery block did not get modern styling: ${JSON.stringify(initialResult)}`);
        }
        if (initialResult.fandomHidden === 'none') {
            await page.click('.source-toggle-btn[data-source="fandom"]');
        }

        await page.waitForFunction(() => {
            const fandomPanel = document.getElementById('fandomManagement');
            return !!fandomPanel && window.getComputedStyle(fandomPanel).display !== 'none';
        }, undefined, { timeout: 15000 });

        const fandomResult = await page.evaluate(() => {
            const fandomPanel = document.getElementById('fandomManagement');
            const fandomResults = document.getElementById('fandom-results');
            const pagination = document.getElementById('fandom-pagination');
            const panelStyle = window.getComputedStyle(fandomPanel);
            const paginationStyle = window.getComputedStyle(pagination);
            return {
                panelDisplay: panelStyle.display,
                panelRadius: panelStyle.borderRadius,
                paginationRadius: paginationStyle.borderRadius,
                hasDiscoveryBlock: !!fandomPanel.querySelector('.scraper-management-block'),
                fandomResultsExists: !!fandomResults
            };
        });

        if (fandomResult.panelDisplay === 'none' || Number.parseFloat(fandomResult.panelRadius) < 18) {
            throw new Error(`Fandom panel did not switch into the updated shell: ${JSON.stringify(fandomResult)}`);
        }
        if (!fandomResult.hasDiscoveryBlock || !fandomResult.fandomResultsExists) {
            throw new Error(`Fandom discovery shell is missing required updated structure: ${JSON.stringify(fandomResult)}`);
        }

        const criticalConsoleErrors = consoleErrors.filter((entry) => !isBenignConsoleError(entry));
        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        console.log(`SCRAPER_VISUAL_SHELL_SMOKE_OK ${JSON.stringify({ initialResult, fandomResult })}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
});
