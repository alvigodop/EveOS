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

// Mock the global structure expected by the module
const context = {
    window: {
        EveOS: {
            API: {
                DisplayInternals: {
                    cleanText: (text, limit) => text.substring(0, limit)
                }
            }
        }
    },
    console
};
context.window.window = context.window;

// Load the display-comick module
const modulePath = path.join(repoRoot, 'js/modules/features/api-search/display-comick.js');
const moduleCode = fs.readFileSync(modulePath, 'utf8');
vm.runInContext(moduleCode, vm.createContext(context));

const mapper = context.window.EveOS.API.DisplayInternals.getComicKMeta;

// Sample Item based on real AOT response
const sampleItem = {
    id: 407,
    hid: "yNrSve_4",
    slug: "shingeki-no-kyojin",
    title: "Attack on Titan",
    status: 2,
    rating: "8.9",
    follow_count: 17731,
    year: 2009,
    country: "jp",
    last_chapter: "139.5",
    content_rating: "safe",
    demographic: 1,
    md_covers: [{ b2key: "shingeki-no-kyojin-cover.jpg" }],
    md_comic_md_genres: [
        { md_genres: { name: "Action" } },
        { md_genres: { name: "Drama" } },
        { md_genres: { name: "Tragedy" } }
    ],
    md_comic_md_tags: [
        { md_tags: { name: "Military" } },
        { md_tags: { name: "Monsters" } },
        { md_tags: { name: "Post-Apocalyptic" } }
    ],
    authors: [{ name: "Isayama Hajime" }],
    artists: [{ name: "Isayama Hajime" }],
    md_titles: [{ title: "進撃の巨人" }],
    translation_completed: true
};

const result = mapper(sampleItem);

console.log('--- ComicK Mapped Result ---');
console.dir(result, { depth: null });
console.log('----------------------------');

// Assertions
assert(result.title === 'Attack on Titan', 'Title mismatch');
assert(result.score === '8.9', 'Score mismatch');
assert(result.genres.includes('Action'), 'Missing Genre: Action');
assert(result.genres.includes('Military'), 'Missing Theme: Military (from md_tags)');
assert(result.genres.includes('Demographic: Shounen'), 'Missing Demographic: Shounen');
assert(result.genres.includes('Translation: Completed'), 'Missing Translation status');
assert(result.contentRating === 'Safe', 'Content rating mismatch');

console.log('COMICK_DISPLAY_SMOKE_OK');
