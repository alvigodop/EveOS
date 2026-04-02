const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

const fetchCalls = [];
const MU_SEARCH_HTML = '<html><body>naruto-search-results</body></html>';

function makeResponse(ok, payload, status = 200) {
    return {
        ok,
        status,
        async json() { return payload; },
        async text() {
            return typeof payload === 'string' ? payload : JSON.stringify(payload);
        }
    };
}

async function fetchStub(url, options = {}) {
    fetchCalls.push({ url, options });

    if (url.endsWith('/api/status')) {
        return makeResponse(false, {}, 404);
    }

    if (url === 'https://api.mangadex.org/manga?title=naruto&limit=8&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc') {
        throw new TypeError('CORS blocked');
    }

    if (url === 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://api.mangadex.org/manga?title=naruto&limit=8&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc')) {
        return makeResponse(true, { data: [{ id: 'md-1' }] });
    }

    if (url === 'https://www.mangaupdates.com/series?search=naruto') {
        throw new TypeError('CORS blocked');
    }

    if (url === 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://www.mangaupdates.com/series?search=naruto')) {
        return makeResponse(true, MU_SEARCH_HTML);
    }

    if (url === 'https://graphql.anilist.co') {
        return makeResponse(true, { data: { Page: { media: [{ id: 123, title: { userPreferred: 'Naruto' } }] } } });
    }

    throw new Error('Unexpected fetch: ' + url);
}

const context = {
    window: { EveOS: { API: {} } },
    console,
    fetch: fetchStub,
    URL,
    URLSearchParams,
    DOMParser: class {
        parseFromString(html) {
            if (html !== MU_SEARCH_HTML) {
                return { querySelectorAll: () => [] };
            }

            const makeCard = ({ href, title, genreTitle, description, year, score, imageUrl }) => ({
                querySelector(selector) {
                    if (selector === 'img[alt="Series Image"]' && imageUrl) {
                        return { getAttribute: () => imageUrl };
                    }
                    if (selector === '.textsmall a[title]' && genreTitle) {
                        return { getAttribute: () => genreTitle };
                    }
                    if (selector === '.mu-markdown-module___SC9hG__mu_markdown') {
                        return { textContent: description };
                    }
                    return null;
                },
                textContent: `${title} ${year} ${score}/10.0`,
                parentElement: null
            });

            const cards = [
                {
                    href: 'https://www.mangaupdates.com/series/7z3yqqk/naruto',
                    title: 'Naruto',
                    genreTitle: 'Action, Adventure, Comedy, Drama, Fantasy, Shounen',
                    description: 'Twelve years ago the Village Hidden in the Leaves was attacked.',
                    year: '1999',
                    score: '7.69',
                    imageUrl: 'https://cdn.mangaupdates.com/image/thumb/i140134.png'
                },
                {
                    href: 'https://www.mangaupdates.com/series/k0z4zlu/naruto-novel',
                    title: 'Naruto (Novel)',
                    genreTitle: 'Action, Adventure, Comedy, Drama, Fantasy',
                    description: 'Vol 1: Innocent Heart, Demonic Blood.',
                    year: '2002',
                    score: '6.39',
                    imageUrl: 'https://cdn.mangaupdates.com/image/thumb/i247509.jpg'
                }
            ].map(data => {
                const card = makeCard(data);
                const anchor = {
                    getAttribute(name) {
                        return name === 'href' ? data.href : '';
                    },
                    textContent: data.title,
                    closest() {
                        return card;
                    },
                    parentElement: card
                };
                return anchor;
            });

            return {
                querySelectorAll(selector) {
                    return selector === 'a[href*="mangaupdates.com/series/"]' ? cards : [];
                }
            };
        }
    },
    AbortController,
    setTimeout,
    clearTimeout
};
context.window.window = context.window;
context.globalThis = context;

const corePath = path.join(repoRoot, 'js/modules/features/api-search/api-core.js');
const coreCode = fs.readFileSync(corePath, 'utf8');
vm.runInContext(coreCode, vm.createContext(context));

(async () => {
    const Core = context.window.EveOS.API.Core;
    await Core.ensureLocalServicesProbed();

    assert(Core.ACTIVE_PROXY_URL === '', 'ACTIVE_PROXY_URL should be empty when no local proxy is running');

    const mangadexUrl = 'https://api.mangadex.org/manga?title=naruto&limit=8&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc';
    const mangadexResult = await Core.fetchWithFallback(mangadexUrl, {}, 'MangaDex Search failed');
    assert(Array.isArray(mangadexResult.data) && mangadexResult.data[0].id === 'md-1', 'MangaDex should fall back to CodeTabs JSON proxy');

    const blockedLocalAttempts = fetchCalls.filter(call =>
        call.url.includes('127.0.0.1:3000') ||
        call.url.includes('127.0.0.1:3037') ||
        call.url.includes('127.0.0.1:3038')
    );
    assert(blockedLocalAttempts.length === 3, 'Only initial status probes should hit local services when bridges are off');

    const anilistPath = path.join(repoRoot, 'js/modules/features/api-search/anilist.js');
    const anilistCode = fs.readFileSync(anilistPath, 'utf8');
    vm.runInContext(anilistCode, context);

    const aniResult = await context.window.EveOS.API.AniList.searchAniListManga('naruto');
    assert(Array.isArray(aniResult.data.Page.media) && aniResult.data.Page.media[0].id === 123, 'AniList direct fetch should succeed without proxy');
    assert(fetchCalls.some(call => call.url === 'https://graphql.anilist.co'), 'AniList should fetch the GraphQL endpoint directly');
    assert(!fetchCalls.some(call => call.url.includes('/api/proxy?url=' + encodeURIComponent('https://graphql.anilist.co'))), 'AniList should not require localhost proxy in bridge-off mode');

    const mangadexPath = path.join(repoRoot, 'js/modules/features/api-search/mangadex.js');
    const mangadexCode = fs.readFileSync(mangadexPath, 'utf8');
    vm.runInContext(mangadexCode, context);

    const mdResult = await context.window.EveOS.API.MangaDex.searchMangaDex('naruto');
    assert(Array.isArray(mdResult.data) && mdResult.data[0].id === 'md-1', 'MangaDex search module should return bridge-off fallback results');

    const mangaupdatesPath = path.join(repoRoot, 'js/modules/features/api-search/mangaupdates.js');
    const mangaupdatesCode = fs.readFileSync(mangaupdatesPath, 'utf8');
    vm.runInContext(mangaupdatesCode, context);

    const muResult = await context.window.EveOS.API.MangaUpdates.searchMangaUpdates('naruto');
    assert(Array.isArray(muResult.results) && muResult.results.length === 2, 'MangaUpdates should return parsed zero-server HTML results');
    assert(muResult.results[0].record.title === 'Naruto', 'MangaUpdates should prioritize the exact Naruto match');
    assert(fetchCalls.some(call => call.url === 'https://www.mangaupdates.com/series?search=naruto'), 'MangaUpdates should request the real search URL');

    console.log('API_SEARCH_BRIDGE_OFF_SMOKE_OK');
})();
