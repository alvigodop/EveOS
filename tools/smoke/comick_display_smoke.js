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
    constructor({ text = '', attrs = {} } = {}) {
        this._text = text;
        this._attrs = attrs;
    }

    get textContent() {
        return this._text;
    }

    getAttribute(name) {
        return this._attrs[name] || '';
    }
}

const sampleSearchItem = {
    id: 407,
    hid: 'yNrSve_4',
    slug: 'my-cells-kingdom',
    title: 'My Cells Kingdom',
    status: 3,
    rating: '6.2',
    year: 2022,
    country: 'cn',
    last_chapter: '9',
    content_rating: 'safe',
    translation_completed: false,
    md_covers: [{ b2key: 'my-cells-kingdom-cover.jpg' }],
    md_titles: [{ title: 'My Miniature Kingdom' }],
    md_genres: [
        { name: 'Action' },
        { name: 'Drama' },
        { name: 'Fantasy' }
    ]
};

const COMICK_PAGE_LINES = [
    'My Cells Kingdom',
    'My Miniature Kingdom • 我的細胞神國 • 我的细胞神国',
    'Origination:',
    'Manhua',
    'Demographic:',
    'Shounen',
    'Published: 2022',
    'Status: Cancelled',
    'Translation: Ongoing',
    'Final Chapter: Chapter 21',
    'Ranked: #12,502',
    'Followed by 702 users',
    'Description',
    'At the beginning of Lin Fan’s life, a sand world appeared, in which the biological cells unearthed from each sand tribe multiplied. He knew, That it would change the world…',
    'More Info',
    'Artists:',
    '创星漫艺工作室',
    'Authors:',
    'BOOM工作室',
    'Genres:',
    'Action, Drama, Fantasy, Sci-Fi',
    'Theme:',
    'Supernatural',
    'Format:',
    'Long Strip, Adaptation, Web Comic, Full Color',
    'Publishers:',
    'BiliBili',
    'Tags',
    'Show less',
    'Male Protagonist',
    'World Building',
    'Strategic Battles',
    'Referrers',
    'raw',
    'Raw',
    'mb'
];

const COMICK_PAGE_TEXT = COMICK_PAGE_LINES.join('\n');
const COMICK_PAGE_HTML = `<html><head><meta property="og:title" content="My Cells Kingdom"><meta property="og:description" content="At the beginning of Lin Fan’s life, a sand world appeared, in which the biological cells unearthed from each sand tribe multiplied."></head><body>${COMICK_PAGE_LINES.join('\n')}</body></html>`;

const fetchCalls = [];

const context = {
    window: {
        EveOS: {
            API: {
                DisplayInternals: {
                    cleanText: (text, limit) => String(text || '').slice(0, limit),
                    uniqStrings(values) {
                        const seen = new Set();
                        const result = [];
                        (Array.isArray(values) ? values : []).forEach((value) => {
                            const next = String(value || '').trim();
                            if (!next) return;
                            const key = next.toLowerCase();
                            if (seen.has(key)) return;
                            seen.add(key);
                            result.push(next);
                        });
                        return result;
                    },
                    limitList(values, max) {
                        return this.uniqStrings(values).slice(0, max);
                    }
                },
                Core: {
                    get ACTIVE_PROXY_URL() {
                        return 'http://127.0.0.1:3000/api/proxy?url=';
                    },
                    async ensureLocalServicesProbed() {
                        return;
                    },
                    async fetchWithFallback(url) {
                        fetchCalls.push({ type: 'search', url });
                        return [sampleSearchItem];
                    },
                    async fetchTextWithFallback(url) {
                        fetchCalls.push({ type: 'page', url });
                        return COMICK_PAGE_HTML;
                    }
                }
            }
        }
    },
    console,
    DOMParser: class {
        parseFromString(html) {
            if (html === COMICK_PAGE_HTML) {
                return {
                    body: {
                        innerText: COMICK_PAGE_TEXT,
                        textContent: COMICK_PAGE_TEXT
                    },
                    querySelector(selector) {
                        if (selector === 'meta[property="og:title"]') {
                            return new FakeNode({ attrs: { content: 'My Cells Kingdom' } });
                        }
                        if (selector === 'meta[property="og:description"]') {
                            return new FakeNode({ attrs: { content: 'At the beginning of Lin Fan’s life, a sand world appeared, in which the biological cells unearthed from each sand tribe multiplied.' } });
                        }
                        return null;
                    }
                };
            }
            return {
                body: { innerText: '', textContent: '' },
                querySelector() { return null; }
            };
        }
    }
};
context.window.window = context.window;
const vmContext = vm.createContext(context);

function loadScript(relPath) {
    const fullPath = path.join(repoRoot, relPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, vmContext);
}

loadScript('js/modules/features/api-search/comick.js');
loadScript('js/modules/features/api-search/display-comick.js');

(async () => {
    const results = await context.window.EveOS.API.ComicK.searchComicK('my cells kingdom');
    assert(Array.isArray(results) && results.length === 1, 'ComicK search should return one result');
    assert(fetchCalls.some((call) => call.type === 'page' && call.url === 'https://comick.dev/comic/my-cells-kingdom'), 'ComicK search should fetch the ComicK page for enrichment');
    assert(results[0]._detail?.finalChapter === '21', 'ComicK detail enrichment should parse final chapter');
    assert(results[0]._detail?.followCount === '702', 'ComicK detail enrichment should parse follow count');
    assert(results[0]._detail?.publishers?.includes('BiliBili'), 'ComicK detail enrichment should parse publishers');
    assert(results[0]._detail?.tags?.includes('Male Protagonist'), 'ComicK detail enrichment should parse source tags');
    assert(results[0]._detail?.tags?.includes('Strategic Battles'), 'ComicK detail enrichment should capture page tags');

    const mapper = context.window.EveOS.API.DisplayInternals.getComicKMeta;
    const result = mapper(results[0]);

    assert(result.title === 'My Cells Kingdom', 'Title mismatch');
    assert(result.score === '6.2', 'Score mismatch');
    assert(result.status === 'Cancelled', 'Status mismatch');
    assert(result.chapters === '21', 'Final chapter should override search last chapter');
    assert(result.rank === '#12502', 'Rank mismatch');
    assert(result.members === '702', 'Follow count mismatch');
    assert(result.author === 'BOOM工作室', 'Author mismatch');
    assert(result.artist === '创星漫艺工作室', 'Artist mismatch');
    assert(result.genres.includes('Sci-Fi'), 'Missing genre from detail page');
    assert(result.genres.includes('Supernatural'), 'Missing theme from detail page');
    assert(result.tags.includes('Male Protagonist'), 'Missing source tag');
    assert(result.tags.includes('World Building'), 'Missing secondary source tag');
    assert(result.tags.includes('Strategic Battles'), 'Missing page tag');
    assert(result.tags.includes('Format: Long Strip'), 'Missing format tag');
    assert(result.tags.includes('Publisher: BiliBili'), 'Missing publisher tag');
    assert(result.tags.includes('Translation: Ongoing'), 'Missing translation tag');
    assert(result.countryOfOrigin === 'CN', 'Country mismatch');
    assert(result.providerUrl === 'https://comick.dev/comic/my-cells-kingdom', 'Provider URL mismatch');

    console.log('COMICK_DISPLAY_SMOKE_OK');
})();
