const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const APP_URL = pathToFileURL(path.resolve(__dirname, '..', '..', 'EveOS.html')).href;

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

    const results = await page.evaluate(async (targetUrls) => {
        const originalStrategies = window.EveOS.Autotitle.Strategies;
        window.EveOS.Autotitle.Strategies = {
            ...originalStrategies,
            Lightpanda: async () => null,
            Camofox: async () => null
        };
        try {
            const collected = [];
            for (const targetUrl of targetUrls) {
                const result = await window.getTitleFromUrl(targetUrl, { allowSlowCover: true });
                collected.push({ url: targetUrl, result });
            }
            return collected;
        } finally {
            window.EveOS.Autotitle.Strategies = originalStrategies;
        }
    }, urls);

    const syntheticFallback = await page.evaluate(async () => {
        const originalStrategies = window.EveOS.Autotitle.Strategies;
        window.EveOS.Autotitle.Strategies = {
            AllOrigins: async () => ({
                title: 'Demo Bookmark',
                icon: 'file:///C:/static/favicon.ico',
                coverUrl: 'https://img1.demo-cdn.com/image?src=%2Fcover%2F42%2F_S19656.jpg'
            }),
            CorsProxy: async () => ({
                title: 'Demo Bookmark',
                icon: 'https://demo.example/favicon.ico',
                coverUrl: 'https://img1.demo-cdn.com/nd_puppy_boy/1/cover/avif/_S51482.jpg.avif'
            }),
            UrlSlug: originalStrategies.UrlSlug
        };
        try {
            return await window.getTitleFromUrl('https://demo.example/demo-bookmark', { allowSlowCover: false });
        } finally {
            window.EveOS.Autotitle.Strategies = originalStrategies;
        }
    });

    const cssUrlFallback = await page.evaluate(async () => {
        const originalStrategies = window.EveOS.Autotitle.Strategies;
        window.EveOS.Autotitle.Strategies = {
            AllOrigins: async () => ({
                title: 'Demo Gallery',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: 'https://gallery.example.org/g/ygm.png'
            }),
            CorsProxy: async () => ({
                title: 'Demo Gallery',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: null
            }),
            ScraperEngine: async () => ({
                title: 'Demo Gallery',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: 'url(&quot;https://gallery.example.org/w/02/182/58845-ox7vpc8u.webp&quot;)'
            }),
            UrlSlug: originalStrategies.UrlSlug
        };
        try {
            return await window.getTitleFromUrl('https://gallery.example.org/g/3716901/37d412a562/', { allowSlowCover: true });
        } finally {
            window.EveOS.Autotitle.Strategies = originalStrategies;
        }
    });

    const galleryHtmlPriority = await page.evaluate(async () => {
        const originalStrategies = window.EveOS.Autotitle.Strategies;
        let calls = 0;
        window.EveOS.Autotitle.Strategies = {
            ...originalStrategies,
            GalleryPageHtml: async () => {
                calls += 1;
                return {
                    title: 'Demo Gallery Title',
                    icon: 'https://gallery.example.org/favicon.ico',
                    coverUrl: 'https://gallery.example.org/w/02/182/58845-ox7vpc8u.webp',
                    source: 'GalleryPageHtml'
                };
            },
            AllOrigins: async () => ({
                title: 'Demo Gallery',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: 'https://gallery.example.org/g/ygm.png'
            }),
            CorsProxy: async () => null,
            ScraperEngine: async () => null
        };
        try {
            const result = await window.getTitleFromUrl('https://gallery.example.org/g/3716901/37d412a562/', { allowSlowCover: true });
            return { result, calls };
        } finally {
            window.EveOS.Autotitle.Strategies = originalStrategies;
        }
    });

    const galleryCoverVariant = await page.evaluate(async () => {
        const originalStrategies = window.EveOS.Autotitle.Strategies;
        window.EveOS.Autotitle.Strategies = {
            ...originalStrategies,
            GalleryPageHtml: async () => ({
                title: 'Variant Demo Gallery',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: 'https://img1.demo-cdn.com/gallery/cover/avif/_S19461.jpg.avif',
                source: 'GalleryPageHtml'
            }),
            AllOrigins: async () => ({
                title: 'Variant Demo Gallery',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: 'https://gallery.example.org/cdn/noImage.png'
            }),
            CorsProxy: async () => null,
            ScraperEngine: async () => null
        };
        try {
            return await window.getTitleFromUrl('https://gallery.example.org/g/3716901/37d412a562/', { allowSlowCover: true });
        } finally {
            window.EveOS.Autotitle.Strategies = originalStrategies;
        }
    });

    const galleryDirectImageCover = await page.evaluate(async () => {
        const originalStrategies = window.EveOS.Autotitle.Strategies;
        window.EveOS.Autotitle.Strategies = {
            ...originalStrategies,
            GalleryPageHtml: async () => ({
                title: 'Direct Image Demo',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: 'https://gallery.example.org/g/abc123.webp',
                source: 'GalleryPageHtml'
            }),
            AllOrigins: async () => null,
            CorsProxy: async () => null,
            ScraperEngine: async () => null
        };
        try {
            return await window.getTitleFromUrl('https://gallery.example.org/g/3716901/37d412a562/', { allowSlowCover: true });
        } finally {
            window.EveOS.Autotitle.Strategies = originalStrategies;
        }
    });

    const headlessCoverUpgrade = await page.evaluate(async () => {
        const originalStrategies = window.EveOS.Autotitle.Strategies;
        let lightpandaCalls = 0;
        let camofoxCalls = 0;
        window.EveOS.Autotitle.Strategies = {
            ...originalStrategies,
            GoogleSearch: async () => null,
            AllOrigins: async () => null,
            CorsProxy: async () => null,
            LinkMeta: async () => null,
            ScraperEngine: async () => null,
            Lightpanda: async () => {
                lightpandaCalls += 1;
                return {
                    title: 'Exact Demo Title',
                    source: 'Lightpanda',
                    coverUrl: 'https://video.example/thumbs/preview-small.jpg'
                };
            },
            Camofox: async () => {
                camofoxCalls += 1;
                return {
                    title: 'Exact Demo Title',
                    source: 'Camofox',
                    coverUrl: 'https://video.example/poster/main-cover.jpg'
                };
            }
        };
        try {
            const result = await window.getTitleFromUrlHeadless('https://video.example/watch/exact-demo', {
                lightpandaTimeoutMs: 1000,
                camofoxTimeoutMs: 1000
            });
            return { result, lightpandaCalls, camofoxCalls };
        } finally {
            window.EveOS.Autotitle.Strategies = originalStrategies;
        }
    });

    const galleryFormatMismatch = await page.evaluate(async () => {
        const originalStrategies = window.EveOS.Autotitle.Strategies;
        window.EveOS.Autotitle.Strategies = {
            ...originalStrategies,
            GalleryPageHtml: async () => ({
                title: 'Format Mismatch Demo',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: 'https://img1.demo-cdn.com/gallery/cover/avif/_S19461.jpg',
                source: 'GalleryPageHtml'
            }),
            AllOrigins: async () => ({
                title: 'Format Mismatch Demo',
                icon: 'https://gallery.example.org/favicon.ico',
                coverUrl: 'https://img1.demo-cdn.com/gallery/cover/avif/_S19461.jpg.avif'
            }),
            CorsProxy: async () => null,
            ScraperEngine: async () => null
        };
        try {
            return await window.getTitleFromUrl('https://gallery.example.org/g/3716901/37d412a562/', { allowSlowCover: true });
        } finally {
            window.EveOS.Autotitle.Strategies = originalStrategies;
        }
    });

    await browser.close();

    const [first, second, third] = results;
    if (!first.result?.title || !/rebuild world/i.test(first.result.title)) {
        throw new Error(`Expected slug-derived Rebuild World title, got ${JSON.stringify(first)}`);
    }
    if (!/99182618-ae92-4aec-a5df-518659b7b613|og\.mangadex\.org\/og-image\/manga\/99182618-ae92-4aec-a5df-518659b7b613/i.test(String(first.result?.coverUrl || ''))) {
        throw new Error(`Expected derived MangaDex cover for first URL, got ${JSON.stringify(first)}`);
    }
    if (!/mangadex\.org\/(?:pwa\/icons\/icon-180\.png|favicon\.ico)/i.test(String(first.result?.icon || ''))) {
        throw new Error(`Expected MangaDex icon for first URL, got ${JSON.stringify(first)}`);
    }

    if (second.result?.title !== "I'm an Evil God") {
        throw new Error(`Expected English MangaDex title for second URL, got ${JSON.stringify(second)}`);
    }
    if (!String(second.result?.coverUrl || '').includes('bf713abe-b415-45ac-8fd1-653dba578e0f')) {
        throw new Error(`Expected MangaDex cover for second URL, got ${JSON.stringify(second)}`);
    }
    if (!/mangadex\.org\/(?:pwa\/icons\/icon-180\.png|favicon\.ico)/i.test(String(second.result?.icon || ''))) {
        throw new Error(`Expected MangaDex icon for second URL, got ${JSON.stringify(second)}`);
    }

    if (!third.result?.title || !/The Genius Prince's Guide to Raising a Nation Out of Debt/i.test(third.result.title)) {
        throw new Error(`Expected cleaned MangaFire title, got ${JSON.stringify(third)}`);
    }
    if (!/static\.mfcdn\.[a-z]{2,3}\//.test(String(third.result?.coverUrl || ''))) {
        throw new Error(`Expected MangaFire cover image, got ${JSON.stringify(third)}`);
    }
    if (!String(third.result?.icon || '').includes('mangafire/favicon')) {
        throw new Error(`Expected MangaFire icon, got ${JSON.stringify(third)}`);
    }

    if (syntheticFallback?.coverUrl !== 'https://img1.demo-cdn.com/nd_puppy_boy/1/cover/avif/_S51482.jpg.avif') {
        throw new Error(`Expected fallback strategy to replace rejected cover candidate, got ${JSON.stringify(syntheticFallback)}`);
    }
    if (syntheticFallback?.icon !== 'https://demo.example/favicon.ico') {
        throw new Error(`Expected rejected local file icon to be dropped in favor of valid remote favicon, got ${JSON.stringify(syntheticFallback)}`);
    }
    if (cssUrlFallback?.coverUrl !== 'https://gallery.example.org/w/02/182/58845-ox7vpc8u.webp') {
        throw new Error(`Expected CSS url cover recovery, got ${JSON.stringify(cssUrlFallback)}`);
    }
    if (galleryHtmlPriority?.calls < 1 || galleryHtmlPriority?.result?.coverUrl !== 'https://gallery.example.org/w/02/182/58845-ox7vpc8u.webp') {
        throw new Error(`Expected gallery page strategy to win cover recovery, got ${JSON.stringify(galleryHtmlPriority)}`);
    }
    if (galleryCoverVariant?.coverUrl !== 'https://img1.demo-cdn.com/gallery/cover/avif/_S19461.jpg.avif') {
        throw new Error(`Expected formatted CDN cover variant to survive, got ${JSON.stringify(galleryCoverVariant)}`);
    }
    if (galleryFormatMismatch?.coverUrl !== 'https://img1.demo-cdn.com/gallery/cover/avif/_S19461.jpg.avif') {
        throw new Error(`Expected avif cover path to beat mismatched jpg variant, got ${JSON.stringify(galleryFormatMismatch)}`);
    }
    if (galleryDirectImageCover?.coverUrl !== 'https://gallery.example.org/g/abc123.webp') {
        throw new Error(`Expected direct gallery image cover to survive normalization, got ${JSON.stringify(galleryDirectImageCover)}`);
    }
    if (headlessCoverUpgrade?.lightpandaCalls !== 1 || headlessCoverUpgrade?.camofoxCalls !== 1) {
        throw new Error(`Expected headless chain to continue from Lightpanda to Camofox on weak cover, got ${JSON.stringify(headlessCoverUpgrade)}`);
    }
    if (headlessCoverUpgrade?.result?.coverUrl !== 'https://video.example/poster/main-cover.jpg') {
        throw new Error(`Expected headless chain to upgrade weak Lightpanda cover with Camofox poster, got ${JSON.stringify(headlessCoverUpgrade)}`);
    }

    console.log(`AUTOTITLE_BROWSER_HTML_SMOKE_OK ${JSON.stringify({ results, syntheticFallback, cssUrlFallback, galleryHtmlPriority, galleryCoverVariant, galleryFormatMismatch, galleryDirectImageCover, headlessCoverUpgrade })}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
