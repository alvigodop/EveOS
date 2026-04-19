const { chromium, waitForApp, FILE_URL } = require('./api_card_settings_browser_smoke.shared');
const { runApiSearchScenario } = require('./api_card_settings_browser_smoke.search');
const { runApiScraperScenario } = require('./api_card_settings_browser_smoke.scraper');
const { assertApiCardSettingsResult } = require('./api_card_settings_browser_smoke.assertions');

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
        await waitForApp(page);
        await page.waitForTimeout(2000);

        const result = {
            ...(await runApiSearchScenario(page)),
            ...(await runApiScraperScenario(page))
        };

        assertApiCardSettingsResult(result, pageErrors, consoleErrors);
        console.log(`API_CARD_SETTINGS_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
