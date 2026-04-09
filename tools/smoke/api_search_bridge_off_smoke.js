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

class FakeNode {
    constructor({ text = '', attrs = {}, children = [], querySelectorMap = {}, querySelectorAllMap = {} } = {}) {
        this._text = text;
        this._attrs = attrs;
        this.children = children;
        this._querySelectorMap = querySelectorMap;
        this._querySelectorAllMap = querySelectorAllMap;
        this.nextElementSibling = null;
    }

    get textContent() {
        if (this._text) return this._text;
        return this.children.map((child) => child.textContent).join(' ');
    }

    getAttribute(name) {
        return this._attrs[name] || '';
    }

    querySelector(selector) {
        return this._querySelectorMap[selector] || null;
    }

    querySelectorAll(selector) {
        return this._querySelectorAllMap[selector] || [];
    }
}

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

function makeLink(text, href) {
    return new FakeNode({ text, attrs: { href } });
}

function makeContent({ text = '', childTexts = [], links = [] } = {}) {
    return new FakeNode({
        text,
        children: childTexts.map((childText) => new FakeNode({ text: childText })),
        querySelectorAllMap: {
            a: links
        }
    });
}

function makeDetailDocument(data) {
    const description = makeContent({ text: data.description });
    const type = makeContent({ text: data.type });
    const relatedSeries = makeContent({ links: data.related.map((entry) => makeLink(entry, `/series/${entry.toLowerCase().replace(/\s+/g, '-')}`)) });
    const associated = makeContent({ childTexts: data.associated });
    const groups = makeContent({ links: data.groups.map((entry) => makeLink(entry, `/group/${entry.toLowerCase().replace(/\s+/g, '-')}`)) });
    const latestReleases = makeContent({ childTexts: data.latestReleases });
    const status = makeContent({ text: data.status });
    const completed = makeContent({ text: data.completed });
    const userRating = makeContent({ text: data.userRating });
    const genre = makeContent({ links: data.genres.map((entry) => makeLink(entry, `/series?genre=${encodeURIComponent(entry)}`)) });
    const categories = makeContent({ links: data.categories.map((entry) => makeLink(entry, `/series?category=${encodeURIComponent(entry)}`)) });
    const authors = makeContent({ links: data.authors.map((entry) => makeLink(entry, `/author/${entry.toLowerCase().replace(/\s+/g, '-')}`)) });
    const artists = makeContent({ links: data.artists.map((entry) => makeLink(entry, `/author/${entry.toLowerCase().replace(/\s+/g, '-')}`)) });
    const year = makeContent({ text: data.year });
    const originalPublisher = makeContent({ links: data.originalPublishers.map((entry) => makeLink(entry, `/publisher/${entry.toLowerCase().replace(/\s+/g, '-')}`)) });
    const publications = makeContent({ childTexts: data.publications });
    const licensed = makeContent({ text: data.licensed });
    const englishPublisher = makeContent({ links: data.englishPublishers.map((entry) => makeLink(entry, `/publisher/${entry.toLowerCase().replace(/\s+/g, '-')}`)) });
    const activityStats = makeContent({ childTexts: data.activityStats });
    const listStats = makeContent({ childTexts: data.listStats });

    const pairs = [
        ['Description', description],
        ['Type', type],
        ['Related Series', relatedSeries],
        ['Associated Names', associated],
        ['Groups Scanlating', groups],
        ['Latest Release(s)', latestReleases],
        ['Status in Country of Origin', status],
        ['Completely Scanlated?', completed],
        ['User Rating', userRating],
        ['Genre', genre],
        ['Categories', categories],
        ['Author(s)', authors],
        ['Artist(s)', artists],
        ['Year', year],
        ['Original Publisher', originalPublisher],
        ['Serialized In (magazine)', publications],
        ['Licensed (in English)', licensed],
        ['English Publisher', englishPublisher],
        ['Activity Stats (vs. other series)', activityStats],
        ['List Stats', listStats]
    ];

    const headers = pairs.map(([label, content]) => {
        const header = new FakeNode({ text: label });
        header.nextElementSibling = content;
        return header;
    });

    const jsonLd = new FakeNode({
        text: JSON.stringify({
            '@type': 'CreativeWork',
            identifier: data.identifier,
            name: data.title,
            image: data.image,
            url: data.url,
            description: data.description,
            datePublished: data.year
        })
    });

    const doc = {
        title: `${data.title} - MangaUpdates`,
        querySelector(selector) {
            if (selector === 'meta[property="og:title"]') return new FakeNode({ attrs: { content: data.title } });
            if (selector === 'meta[property="og:description"]') return new FakeNode({ attrs: { content: data.description } });
            if (selector === 'meta[property="og:image"]') return new FakeNode({ attrs: { content: data.image } });
            if (selector === 'link[rel="canonical"]') return new FakeNode({ attrs: { href: data.url } });
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'div[data-cy$="-header"]') return headers;
            if (selector === 'script[type="application/ld+json"]') return [jsonLd];
            return [];
        }
    };

    return doc;
}

const fetchCalls = [];
const MU_SEARCH_HTML = '<html><body>naruto-search-results</body></html>';
const MU_DETAIL_HTML = '<html><body>naruto-detail</body></html>';
const MU_NOVEL_DETAIL_HTML = '<html><body>naruto-novel-detail</body></html>';

const narutoDetailData = {
    identifier: 777777,
    title: 'Naruto',
    url: 'https://www.mangaupdates.com/series/7z3yqqk/naruto',
    image: 'https://cdn.mangaupdates.com/image/thumb/naruto.jpg',
    description: 'Twelve years ago the Village Hidden in the Leaves was attacked by a fearsome threat.',
    type: 'Manga',
    related: ['Boruto: Naruto Next Generations'],
    associated: ['NARUTO -ナルト-', 'ナルト'],
    groups: ['Dattebayo'],
    latestReleases: ['c.700 by Dattebayo 10 years ago'],
    status: '700 Chapters (Completed)',
    completed: 'Yes',
    userRating: 'Average: 8.1 / 10.0 (100 votes) Bayesian Average: 7.69 / 10.0',
    genres: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Shounen'],
    categories: ['Male Protagonist', 'Ninja', 'Orphan'],
    authors: ['Kishimoto Masashi'],
    artists: ['Kishimoto Masashi'],
    year: '1999',
    originalPublishers: ['Shueisha'],
    publications: ['Weekly Shounen Jump'],
    licensed: 'Yes',
    englishPublishers: ['VIZ Media'],
    activityStats: [
        'Weekly Pos #764 (-38)',
        'Monthly Pos #1874 (No change)'
    ],
    listStats: [
        'On 41 reading lists',
        'On 19 wish lists',
        'On 6 completed lists'
    ]
};

const narutoNovelDetailData = {
    identifier: 888888,
    title: 'Naruto (Novel)',
    url: 'https://www.mangaupdates.com/series/k0z4zlu/naruto-novel',
    image: 'https://cdn.mangaupdates.com/image/thumb/naruto-novel.jpg',
    description: 'Vol 1: Innocent Heart, Demonic Blood.',
    type: 'Novel',
    related: [],
    associated: ['Naruto Novel'],
    groups: [],
    latestReleases: [],
    status: '1 Volume (Completed)',
    completed: 'No',
    userRating: 'Average: 6.5 / 10.0 (10 votes) Bayesian Average: 6.39 / 10.0',
    genres: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy'],
    categories: ['Novel'],
    authors: ['Kishimoto Masashi'],
    artists: [],
    year: '2002',
    originalPublishers: ['Shueisha'],
    publications: ['JUMP j-BOOKS'],
    licensed: 'No',
    englishPublishers: [],
    activityStats: ['Weekly Pos #2000 (No change)'],
    listStats: ['On 5 reading lists']
};

async function fetchStub(url, options = {}) {
    fetchCalls.push({ url, options });

    if (url.endsWith('/api/status')) {
        return makeResponse(false, {}, 404);
    }

    if (url === 'https://api.mangadex.org/manga?title=naruto&limit=8&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc') {
        throw new TypeError('CORS blocked');
    }

    if (url === 'https://api.mangadex.org/manga?title=naruto&limit=20&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc') {
        throw new TypeError('CORS blocked');
    }

    if (url === 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://api.mangadex.org/manga?title=naruto&limit=8&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc')) {
        return makeResponse(true, { data: [{ id: 'md-1' }] });
    }

    if (url === 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://api.mangadex.org/manga?title=naruto&limit=20&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc')) {
        return makeResponse(true, { data: [{ id: 'md-1' }] });
    }

    if (url === 'https://api.mangadex.org/statistics/manga?manga[]=md-1') {
        throw new TypeError('CORS blocked');
    }

    if (url === 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://api.mangadex.org/statistics/manga?manga[]=md-1')) {
        return makeResponse(true, { statistics: { 'md-1': { follows: 12345 } } });
    }

    if (url === 'https://www.mangaupdates.com/series?search=naruto') {
        throw new TypeError('CORS blocked');
    }

    if (url === 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://www.mangaupdates.com/series?search=naruto')) {
        return makeResponse(true, MU_SEARCH_HTML);
    }

    if (url === 'https://api.comick.dev/comic/naruto/?tachiyomi=true') {
        throw new TypeError('CORS blocked');
    }

    if (url === 'http://127.0.0.1:3000/api/proxy?url=' + encodeURIComponent('https://api.comick.dev/comic/naruto/?tachiyomi=true')) {
        return makeResponse(false, {}, 502);
    }

    if (url === 'https://www.mangaupdates.com/series/7z3yqqk/naruto') {
        return makeResponse(true, MU_DETAIL_HTML);
    }

    if (url === 'https://www.mangaupdates.com/series/k0z4zlu/naruto-novel') {
        return makeResponse(true, MU_NOVEL_DETAIL_HTML);
    }

    if (url === 'https://graphql.anilist.co') {
        return makeResponse(true, { data: { Page: { media: [{ id: 123, title: { userPreferred: 'Naruto' } }] } } });
    }

    throw new Error('Unexpected fetch: ' + url);
}

const context = {
    window: { EveOS: { API: { DisplayInternals: {} } } },
    console,
    fetch: fetchStub,
    URL,
    URLSearchParams,
    DOMParser: class {
        parseFromString(html) {
            if (html === MU_SEARCH_HTML) {
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
                ].map((data) => {
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

            if (html === MU_DETAIL_HTML) return makeDetailDocument(narutoDetailData);
            if (html === MU_NOVEL_DETAIL_HTML) return makeDetailDocument(narutoNovelDetailData);

            return {
                title: '',
                querySelector() { return null; },
                querySelectorAll() { return []; }
            };
        }
    },
    AbortController,
    setTimeout,
    clearTimeout
};
context.window.window = context.window;
context.globalThis = context;

const vmContext = vm.createContext(context);

function loadScript(relPath) {
    const fullPath = path.join(repoRoot, relPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, vmContext);
}

(async () => {
    loadScript('js/modules/features/api-search/api-core.js');

    const Core = context.window.EveOS.API.Core;
    await Core.ensureLocalServicesProbed();

    assert(Core.ACTIVE_PROXY_URL === '', 'ACTIVE_PROXY_URL should be empty when no local proxy is running');

    const mangadexUrl = 'https://api.mangadex.org/manga?title=naruto&limit=8&includes[]=author&includes[]=cover_art&includes[]=artist&order[relevance]=desc';
    const mangadexResult = await Core.fetchWithFallback(mangadexUrl, {}, 'MangaDex Search failed');
    assert(Array.isArray(mangadexResult.data) && mangadexResult.data[0].id === 'md-1', 'MangaDex should fall back to CodeTabs JSON proxy');

    const localStatusProbes = fetchCalls.filter((call) =>
        call.url === 'http://127.0.0.1:3000/api/status'
        || call.url === 'http://127.0.0.1:3037/api/status'
        || call.url === 'http://127.0.0.1:3038/api/status'
        || call.url === 'http://127.0.0.1:3039/api/status'
    );
    assert(localStatusProbes.length === 4, 'Initial status probes should hit all four local services');

    loadScript('js/modules/features/api-search/anilist.js');
    const aniResult = await context.window.EveOS.API.AniList.searchAniListManga('naruto');
    assert(Array.isArray(aniResult.data.Page.media) && aniResult.data.Page.media[0].id === 123, 'AniList direct fetch should succeed without proxy');
    assert(fetchCalls.some((call) => call.url === 'https://graphql.anilist.co'), 'AniList should fetch the GraphQL endpoint directly');
    assert(!fetchCalls.some((call) => call.url.includes('/api/proxy?url=' + encodeURIComponent('https://graphql.anilist.co'))), 'AniList should not require localhost proxy in bridge-off mode');

    loadScript('js/modules/features/api-search/mangadex.js');
    const mdResult = await context.window.EveOS.API.MangaDex.searchMangaDex('naruto');
    assert(Array.isArray(mdResult.data) && mdResult.data[0].id === 'md-1', 'MangaDex search module should return bridge-off fallback results');

    loadScript('js/modules/features/api-search/mangaupdates.js');
    const muResult = await context.window.EveOS.API.MangaUpdates.searchMangaUpdates('naruto');
    assert(Array.isArray(muResult.results) && muResult.results.length === 2, 'MangaUpdates should return parsed zero-server HTML results');
    assert(muResult.results[0].record.title === 'Naruto', 'MangaUpdates should prioritize the exact Naruto match');
    assert(fetchCalls.some((call) => call.url === 'https://www.mangaupdates.com/series?search=naruto'), 'MangaUpdates should request the real search URL');
    assert(fetchCalls.some((call) => call.url === 'https://www.mangaupdates.com/series/7z3yqqk/naruto'), 'MangaUpdates should enrich search results from the series detail page');
    assert(muResult.results[0]._fullDetails?.categories?.some((entry) => entry.category === 'Ninja'), 'MangaUpdates detail enrichment should capture categories');
    assert(muResult.results[0]._fullDetails?.publications?.[0]?.publication_name === 'Weekly Shounen Jump', 'MangaUpdates detail enrichment should capture publications');
    assert(muResult.results[0]._fullDetails?.rank?.lists?.reading === 41, 'MangaUpdates detail enrichment should capture list stats');

    const comickDetailUrl = 'https://api.comick.dev/comic/naruto/?tachiyomi=true';
    const comickDetailResult = await Core.fetchWithFallback(comickDetailUrl, {}, 'ComicK Detail failed');
    assert(comickDetailResult === null, 'ComicK detail should return null when direct/local/public proxy fetches fail');
    assert(!fetchCalls.some((call) => call.url.includes('127.0.0.1:3037/api/lightpanda?format=json&url=' + encodeURIComponent(comickDetailUrl))), 'API detail fetches should not fall through to Lightpanda');
    assert(!fetchCalls.some((call) => call.url.includes('127.0.0.1:3038/api/camofox?format=json&url=' + encodeURIComponent(comickDetailUrl))), 'API detail fetches should not fall through to Camofox');

    loadScript('js/modules/features/api-search/display-utils.js');
    loadScript('js/modules/features/api-search/display-mangaupdates.js');
    const muCard = context.window.EveOS.API.DisplayInternals.getMangaUpdatesMeta(muResult.results[0]);
    assert(muCard.status === 'Completed', 'MangaUpdates display mapping should derive status from source detail');
    assert(muCard.chapters === '700', 'MangaUpdates display mapping should derive chapters from source detail');
    assert(muCard.tags.includes('Publishers: Shueisha, VIZ Media'), 'MangaUpdates display mapping should surface publishers');
    assert(muCard.tags.includes('Reading: 41'), 'MangaUpdates display mapping should surface list stats');
    assert(muCard.genres.includes('Ninja'), 'MangaUpdates display mapping should surface categories as prominent chips');

    console.log('API_SEARCH_BRIDGE_OFF_SMOKE_OK');
})();
