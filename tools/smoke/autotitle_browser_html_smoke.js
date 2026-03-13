const { chromium } = require('playwright');

const APP_URL = 'file:///C:/Users/alvin/Documents/Workspace/RoughProjDeving/EveOS-0.4/EveOS.html';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', (msg) => {
        const text = msg.text();
        if (/Autotitle:|MicroLink strategy:|AllOrigins failed|CorsProxy failed|LinkMeta failed|ScraperEngine/.test(text)) {
            console.log(text);
        }
    });

    await page.goto(APP_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.getTitleFromUrl === 'function', null, { timeout: 60000 });

    const urls = [
        'https://mangadex.org/title/99182618-ae92-4aec-a5df-518659b7b613/rebuild-world?tab=chapters',
        'https://mangadex.org/title/bf713abe-b415-45ac-8fd1-653dba578e0f',
        'https://mangafire.to/manga/souda-baikoku-shiyou-tensai-ouji-no-akaji-kokka-saisei-jutsuu.0229k'
    ];

    const results = [];
    for (const url of urls) {
        const result = await page.evaluate(async (targetUrl) => {
            return await window.getTitleFromUrl(targetUrl, { allowSlowCover: true });
        }, url);
        results.push({ url, result });
    }

    await browser.close();

    const [first, second, third] = results;
    if (!first.result?.title || !/rebuild world/i.test(first.result.title)) {
        throw new Error(`Expected slug-derived Rebuild World title, got ${JSON.stringify(first)}`);
    }
    if (!String(first.result?.coverUrl || '').includes('99182618-ae92-4aec-a5df-518659b7b613')) {
        throw new Error(`Expected derived MangaDex cover for first URL, got ${JSON.stringify(first)}`);
    }
    if (!String(first.result?.icon || '').includes('mangadex.org/pwa/icons/icon-180.png')) {
        throw new Error(`Expected MangaDex icon for first URL, got ${JSON.stringify(first)}`);
    }

    if (second.result?.title !== "I'm an Evil God") {
        throw new Error(`Expected English MangaDex title for second URL, got ${JSON.stringify(second)}`);
    }
    if (!String(second.result?.coverUrl || '').includes('bf713abe-b415-45ac-8fd1-653dba578e0f')) {
        throw new Error(`Expected MangaDex cover for second URL, got ${JSON.stringify(second)}`);
    }
    if (!String(second.result?.icon || '').includes('mangadex.org/pwa/icons/icon-180.png')) {
        throw new Error(`Expected MangaDex icon for second URL, got ${JSON.stringify(second)}`);
    }

    if (!third.result?.title || !/The Genius Prince's Guide to Raising a Nation Out of Debt/i.test(third.result.title)) {
        throw new Error(`Expected cleaned MangaFire title, got ${JSON.stringify(third)}`);
    }
    if (!String(third.result?.coverUrl || '').includes('static.mfcdn.cc/')) {
        throw new Error(`Expected MangaFire cover image, got ${JSON.stringify(third)}`);
    }
    if (!String(third.result?.icon || '').includes('mangafire/favicon')) {
        throw new Error(`Expected MangaFire icon, got ${JSON.stringify(third)}`);
    }

    console.log(`AUTOTITLE_BROWSER_HTML_SMOKE_OK ${JSON.stringify(results)}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
