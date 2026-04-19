const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openCategorySettings === 'function'
        && typeof window.switchCategoryTab === 'function'
        && !!window.EveOS?.API?.Manager?.runSearch
        && !!window.EveOS?.API?.Cache
        && !!window.CategoryScraperPanel
        && !!document.getElementById('categorySettingsModal')
    ), undefined, { timeout: 180000 });
}

module.exports = {
    chromium,
    waitForApp,
    FILE_URL
};
