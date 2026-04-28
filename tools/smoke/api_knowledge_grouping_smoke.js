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

const scopedStore = {
    Alpha: {
        wikiEntries: [{ title: 'Naruto', name: 'Naruto' }],
        fandomDomains: [{ domain: 'naruto.fandom.com', name: 'Narutopedia' }],
        fandomCacheIndex: {
            'naruto.fandom.com': {
                domain: 'naruto.fandom.com',
                itemCount: 1,
                updatedAt: '2026-04-04T09:05:00.000Z'
            }
        },
        wikiCacheStore: {
            Naruto: { title: 'Naruto', extract: 'Leaf village ninja.', lastUpdate: '2026-04-04T09:00:00.000Z' },
            entryResults: {
                Naruto: {
                    main: { title: 'Naruto', extract: 'Leaf village ninja.' },
                    searchResults: {
                        chakra: { title: 'Chakra', snippet: 'Energy system.' }
                    },
                    lastUpdate: '2026-04-04T09:00:00.000Z'
                }
            }
        },
        wikiDataStore: {
            searchResults: {
                'naruto.fandom.com': {
                    lastUpdate: '2026-04-04T09:05:00.000Z',
                    Naruto: {
                        title: 'Naruto Wiki',
                        url: 'https://naruto.fandom.com/wiki/Naruto_Uzumaki',
                        domain: 'naruto.fandom.com'
                    }
                }
            }
        }
    }
};

const context = {
    console,
    URL,
    window: {
        location: { href: 'https://example.com/app' },
        EveOS: {
            API: {
                Cache: {
                    async listQueries(categoryName) {
                        if (categoryName !== 'Alpha') return [];
                        return [{
                            query: 'naruto',
                            updatedAt: Date.parse('2026-04-04T09:10:00.000Z'),
                            summary: {
                                perSource: {
                                    mangadex: 2,
                                    openlibrary: 1
                                }
                            }
                        }];
                    }
                }
            }
        }
    }
};

context.window.window = context.window;
context.globalThis = context;
context.window.EveOS.API.SearchInternals = {
    ensureCategoryContext(categoryName) {
        return String(categoryName || '').trim();
    },
    async getScopedStorageValueAsync(key, defaultValue, categoryName) {
        const bucket = scopedStore[String(categoryName || '').trim()] || {};
        return Object.prototype.hasOwnProperty.call(bucket, key) ? bucket[key] : defaultValue;
    },
    async saveScopedStorageValueAsync() {
        return true;
    },
    toTimestamp(value) {
        if (Number(value) > 0) return Number(value);
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? parsed : 0;
    },
    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};

const vmContext = vm.createContext(context);

function loadScript(relPath) {
    const code = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    vm.runInContext(code, vmContext, { filename: relPath });
}

[
    'js/modules/features/api-search/components/api-knowledge-core.shared.js',
    'js/modules/features/api-search/components/api-knowledge-core.cache.js',
    'js/modules/features/api-search/components/api-knowledge-core.results.js',
    'js/modules/features/api-search/components/api-knowledge-core.js'
].forEach(loadScript);

(async () => {
    const ctx = context.window.EveOS.API.SearchInternals;
    const groups = await ctx.buildSourceCacheGroups('Alpha', { includeUncachedKnowledge: true });
    assert(groups.length === 1, 'Knowledge grouping should merge Wikipedia, Fandom, and API cache into one Naruto source group');

    const narutoGroup = groups[0];
    assert(!!narutoGroup.wikipediaEntry, 'Grouped source should include the cached Wikipedia entry');
    assert(!!narutoGroup.fandomEntry, 'Grouped source should include the cached Fandom entry');
    assert(Array.isArray(narutoGroup.apiEntries) && narutoGroup.apiEntries.length === 1, 'Grouped source should include cached API queries');
    assert(narutoGroup.updatedAt === Date.parse('2026-04-04T09:10:00.000Z'), 'Grouped source should use API cache updatedAt when it is freshest');

    const foundGroup = await ctx.findSourceCacheGroup('Alpha', ['Narutopedia', 'naruto']);
    assert(foundGroup && foundGroup.id === narutoGroup.id, 'Grouped source lookup should match aliases across wiki/fandom/API identities');

    const fandomTitle = ctx.resolveKnowledgeResultTitle({
        title: 'Naruto Wiki | Narutopedia',
        wiki_name: 'Narutopedia',
        url: 'https://naruto.fandom.com/wiki/Naruto_Uzumaki',
        domain: 'naruto.fandom.com'
    }, 'fandom');
    assert(fandomTitle === 'Naruto Uzumaki', 'Generic cached Fandom titles should be repaired from the page slug');

    const sectionMarkup = ctx.buildKnowledgeResultsSection('fandom', {
        sourceCount: 1,
        results: [{
            title: 'Naruto Wiki | Narutopedia',
            wiki_name: 'Narutopedia',
            url: 'https://naruto.fandom.com/wiki/Naruto_Uzumaki',
            domain: 'naruto.fandom.com',
            snippet: 'Naruto Uzumaki ninja profile page.',
            categories: ['Characters']
        }]
    }, 'Alpha');
    assert(sectionMarkup.includes('Naruto Uzumaki'), 'Fandom section markup should render repaired titles');
    assert(!sectionMarkup.includes('Naruto Wiki | Narutopedia'), 'Fandom section markup should not keep the generic cached title');

    console.log('API_KNOWLEDGE_GROUPING_SMOKE_OK');
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
