const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => !!window.EveFolderHoverTooltip, undefined, { timeout: 180000 });

        await page.evaluate(() => {
            const target = document.createElement('button');
            target.id = 'folder-tooltip-smoke-target';
            target.type = 'button';
            target.textContent = 'Folder Name';
            target.dataset.folderHoverLabel = 'Archive Vault';
            target.dataset.folderHoverMeta = '12 items | 3 folders';
            target.style.position = 'fixed';
            target.style.left = '220px';
            target.style.top = '240px';
            document.body.appendChild(target);
        });

        await page.hover('#folder-tooltip-smoke-target');
        await page.waitForSelector('.eve-folder-hover-card.is-visible', { timeout: 5000 });
        const state = await page.evaluate(() => {
            const tooltip = document.querySelector('.eve-folder-hover-card.is-visible');
            return {
                name: tooltip?.querySelector('.eve-folder-hover-card__name')?.textContent?.trim() || '',
                meta: tooltip?.querySelector('.eve-folder-hover-card__meta')?.textContent?.trim() || '',
                pointerEvents: tooltip ? getComputedStyle(tooltip).pointerEvents : ''
            };
        });

        assert(state.name === 'Archive Vault', `Expected folder tooltip name, saw ${JSON.stringify(state)}`);
        assert(state.meta === '12 items | 3 folders', `Expected folder tooltip meta, saw ${JSON.stringify(state)}`);
        assert(state.pointerEvents === 'none', `Tooltip should not intercept folder clicks: ${JSON.stringify(state)}`);

        console.log('FOLDER_HOVER_TOOLTIP_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
