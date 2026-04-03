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

const sampleSearchItem = {
    id: 606,
    slug: '01-kingdom',
    title: 'Kingdom',
    rating: '9.4',
    year: 2006,
    country: 'jp',
    status: 1,
    last_chapter: 861,
    translation_completed: false,
    md_covers: [{ b2key: 'oamWpb.jpg' }],
    md_titles: [{ title: 'Kingdom' }]
};

const COMICK_SNAPSHOT_TEXT = [
    '- text: "Vol 50, Chap 540 (S6P1) Chap 82-100, 485 Ranked: #554 Followed by"',
    '- link "26,773 users" [e20]:',
    '- heading "Description" [level=3]',
    '- paragraph: "Millions of years have passed since the times of legends, when the worlds of man and gods were still the same."',
    '- \'row "Artists: Hara Yasuhisa"\':',
    '- \'row "Authors: Hara Yasuhisa"\':',
    '- \'row "Genres: Action, Drama, Ecchi, Historical, Gore"\':',
    '- \'row "Theme: Military, Survival"\':',
    '- \'row "Format: Award Winning"\':',
    '- \'row "Publishers: Shueisha"\':',
    '- heading "Tags Show hidden tags" [level=3]',
    '- list:',
    '- \'listitem "Vote: 49"\':',
    '- link "War/s" [e45]:',
    '- \'listitem "Vote: 27"\':',
    '- link "Strategic Battles" [e61]:',
    '- \'listitem "Vote: 1"\':',
    '- link "Male Protagonist" [e114]:',
    '- \'listitem "Vote: 1"\':',
    '- link "Historical References" [e119]:',
    '- heading "Reviews" [level=3]'
].join('\n');

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
                    async fetchWithFallback(url) {
                        fetchCalls.push({ type: 'search', url });
                        return [sampleSearchItem];
                    },
                    async fetchTextWithFallback(url) {
                        fetchCalls.push({ type: 'page', url });
                        return COMICK_SNAPSHOT_TEXT;
                    }
                }
            }
        }
    },
    console,
    DOMParser: class {
        parseFromString(text) {
            return {
                body: {
                    innerText: String(text || ''),
                    textContent: String(text || '')
                },
                querySelector() {
                    return null;
                }
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
    const results = await context.window.EveOS.API.ComicK.searchComicK('kingdom');
    const detail = results[0]._detail || {};

    assert(detail.followCount === '26773', 'Snapshot parser should extract follow count');
    assert(detail.authors.includes('Hara Yasuhisa'), 'Snapshot parser should extract authors');
    assert(detail.publishers.includes('Shueisha'), 'Snapshot parser should extract publishers');
    assert(detail.genres.includes('Historical'), 'Snapshot parser should extract genres');
    assert(detail.tags.includes('Strategic Battles'), 'Snapshot parser should extract snapshot tags');
    assert(detail.tags.includes('Male Protagonist'), 'Snapshot parser should extract lower-vote tags');

    const card = context.window.EveOS.API.DisplayInternals.getComicKMeta(results[0]);
    assert(card.tags.includes('Strategic Battles'), 'Display mapping should expose snapshot tags');
    assert(card.tags.includes('Male Protagonist'), 'Display mapping should expose late snapshot tags');
    assert(card.tags.includes('Publisher: Shueisha'), 'Display mapping should expose snapshot publishers');
    assert(card.genres.includes('Military'), 'Display mapping should expose snapshot themes');

    console.log('COMICK_SNAPSHOT_SMOKE_OK');
})();
